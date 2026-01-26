import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { sql, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { waitlistSignups } from "@/db/schema";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

function maskEmail(value: string) {
  const email = value.trim();
  const at = email.indexOf("@");
  if (at <= 0) return "<invalid>";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  const localMasked = local.length <= 2
    ? `${local[0] ?? "*"}*`
    : `${local[0]}***${local.slice(-1)}`;

  const domainParts = domain.split(".");
  const domainFirst = domainParts[0] ?? domain;
  const domainMasked = domainFirst.length <= 2
    ? `${domainFirst[0] ?? "*"}*`
    : `${domainFirst[0]}***${domainFirst.slice(-1)}`;
  const tld = domainParts.length > 1 ? `.${domainParts.slice(1).join(".")}` : "";

  return `${localMasked}@${domainMasked}${tld}`;
}

function normalizeLooseText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeForSearch(value: string) {
  return normalizeLooseText(value).toLowerCase();
}

function safeOriginFromRequest(req: Request) {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  try {
    return new URL(req.url).origin;
  } catch {
    return "http://localhost:3000";
  }
}

function isUniqueViolation(error: unknown) {
  const code = (error as { code?: string } | null | undefined)?.code;
  return code === "23505";
}

function generateReferralCode(length = 10) {
  // URL-safe, short, and case-insensitive.
  return randomBytes(16)
    .toString("base64url")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, length)
    .toUpperCase();
}

const WaitlistSignupSchema = z
  .object({
    role: z.enum(["provider", "customer"]),
    email: z.string().trim().email(),
    suburbCity: z.string().trim().min(2).max(255),

    categoryText: z.string().trim().optional(),
    yearsExperience: z
      .union([z.number(), z.string()])
      .optional()
      .transform((v) => {
        if (v === undefined) return undefined;
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isFinite(n)) return undefined;
        return Math.trunc(n);
      }),

    ref: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === "provider") {
      const text = (data.categoryText ?? "").trim();
      if (!text) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["categoryText"], message: "What service do you provide? is required" });
        return;
      }
      if (text.length < 2 || text.length > 60) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["categoryText"], message: "Category must be 2–60 characters" });
        return;
      }
      // Allow letters/numbers/spaces + basic punctuation.
      if (!/^[A-Za-z0-9 .,&'()\-+/#!?]+$/.test(text)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["categoryText"], message: "Category contains invalid characters" });
      }
    }

    if (data.yearsExperience !== undefined) {
      if (typeof data.yearsExperience !== "number" || !Number.isFinite(data.yearsExperience)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["yearsExperience"], message: "Years experience must be a number" });
        return;
      }
      if (data.yearsExperience < 0 || data.yearsExperience > 80) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["yearsExperience"], message: "Years experience must be between 0 and 80" });
      }
    }
  });

async function referralCountForSignupId(id: string) {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(waitlistSignups)
    .where(eq(waitlistSignups.referredById, id));

  return Number(row?.count ?? 0);
}

function buildWaitlistEmailHtml(params: {
  referralLink: string;
  role: "provider" | "customer";
  referralCount: number;
}) {
  const { referralLink, role, referralCount } = params;
  const headline = role === "provider" ? "Thanks for joining as a provider." : "Thanks for joining as a customer.";
  const launchLine = role === "provider"
    ? "You’ll get early access to set up your services and help shape Verial before we open to customers."
    : "We’ll email you when Verial launches across New Zealand.";

  return `
  <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5;">
    <h2>You’re on the Verial waitlist</h2>
    <p>${headline}</p>
    <p>${launchLine}</p>

    <h3>Move up the list</h3>
    <p>Invite friends using your referral link:</p>
    <p><a href="${referralLink}">${referralLink}</a></p>
    <p>You’ve referred <strong>${referralCount}</strong> people. Refer 3 to move up the list.</p>

    <p style="color: #666; font-size: 12px;">If you didn’t request this, you can ignore this email.</p>
  </div>
  `.trim();
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();

  if (process.env.NODE_ENV !== "production") {
    const cookie = req.headers.get("cookie") ?? "";
    console.info("[WAITLIST] auth_check", {
      requestId,
      hasAuthorizationHeader: Boolean(req.headers.get("authorization")),
      hasClerkSessionCookie: cookie.includes("__session="),
    });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = WaitlistSignupSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const rate = await enforceRateLimit(req, {
    resource: "waitlist:signup",
    limit: 10,
    windowSeconds: 60,
  });
  if (!rate.success) return rateLimitResponse(rate.retryAfter);

  const role = parsed.data.role;
  const email = parsed.data.email.trim();
  const emailLower = email.trim().toLowerCase();
  const suburbCity = normalizeLooseText(parsed.data.suburbCity);
  const suburbCityNorm = normalizeForSearch(suburbCity);

  const categoryText = role === "provider" ? normalizeLooseText(parsed.data.categoryText ?? "") : null;
  const categoryNorm = role === "provider" ? normalizeForSearch(categoryText ?? "") : null;
  const yearsExperience = parsed.data.yearsExperience ?? null;

  const ref = parsed.data.ref ? parsed.data.ref.trim().toUpperCase() : null;

  console.info("[WAITLIST_EMAIL] request", {
    requestId,
    role,
    email: maskEmail(email),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
    },
    configPresent: {
      RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY),
      EMAIL_FROM: Boolean(process.env.EMAIL_FROM),
      NEXT_PUBLIC_SITE_URL: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
      NEXT_PUBLIC_APP_URL: Boolean(process.env.NEXT_PUBLIC_APP_URL),
      VERCEL_URL: Boolean(process.env.VERCEL_URL),
    },
  });

  const existing = await db.query.waitlistSignups.findFirst({
    where: (w, { eq }) => eq(w.emailLower, emailLower),
  });

  const origin = safeOriginFromRequest(req);

  if (existing) {
    console.info("[WAITLIST_EMAIL] existing_signup", {
      requestId,
      signupId: existing.id,
      email: maskEmail(existing.email),
      lastConfirmationEmailSentAt: existing.lastConfirmationEmailSentAt?.toISOString?.() ?? null,
      origin,
    });

    const referralCount = await referralCountForSignupId(existing.id);
    const referralUrl = `${origin}/waitlist?ref=${encodeURIComponent(existing.referralCode)}`;

    return NextResponse.json({
      ok: true,
      status: "already_joined" as const,
      message: "You're already on the waitlist.",
      referralCode: existing.referralCode,
      referralUrl,
      referralCount,
    });
  }

  let referredById: string | null = null;
  if (ref) {
    const referrer = await db.query.waitlistSignups.findFirst({
      where: (w, { eq }) => eq(w.referralCode, ref),
      columns: { id: true, emailLower: true },
    });
    if (referrer && referrer.emailLower !== emailLower) {
      referredById = referrer.id;
    }
  }

  const tags: string[] = [
    `role:${role}`,
    `location:${suburbCityNorm}`,
  ];
  if (role === "provider" && categoryNorm) tags.push(`category:${categoryNorm}`);

  let created: { id: string; role: "provider" | "customer"; referralCode: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = crypto.randomUUID();
    const referralCode = generateReferralCode();
    try {
      const [row] = await db
        .insert(waitlistSignups)
        .values({
          id,
          role,
          email,
          emailLower,
          suburbCity,
          suburbCityNorm,
          categoryText,
          categoryNorm,
          yearsExperience,
          referralCode,
          referredById,
          tags,
        })
        .returning({ id: waitlistSignups.id, role: waitlistSignups.role, referralCode: waitlistSignups.referralCode });

      if (row) {
        created = row;
        break;
      }
    } catch (error) {
      if (isUniqueViolation(error)) {
        const winner = await db.query.waitlistSignups.findFirst({
          where: (w, { eq }) => eq(w.emailLower, emailLower),
        });
        if (winner) {
          const referralCount = await referralCountForSignupId(winner.id);
          const referralUrl = `${origin}/waitlist?ref=${encodeURIComponent(winner.referralCode)}`;
          return NextResponse.json({
            ok: true,
            status: "already_joined" as const,
            message: "You're already on the waitlist.",
            referralCode: winner.referralCode,
            referralUrl,
            referralCount,
          });
        }

        // Unique violation, but not the emailLower row (likely referralCode collision). Retry.
        continue;
      }

      console.error("[WAITLIST] insert_failed", { requestId, message: error instanceof Error ? error.message : String(error) });
      return NextResponse.json({ error: "Unable to create waitlist signup" }, { status: 500 });
    }
  }

  if (!created) {
    return NextResponse.json({ error: "Unable to create waitlist signup" }, { status: 500 });
  }

  const referralCount = 0;
  const referralUrl = `${origin}/waitlist?ref=${encodeURIComponent(created.referralCode)}`;

  console.info("[WAITLIST_EMAIL] created_signup", {
    requestId,
    signupId: created.id,
    to: maskEmail(email),
    origin,
  });

  const result = await sendEmail({
    to: email,
    subject: "You’re on the Verial waitlist",
    html: buildWaitlistEmailHtml({ referralLink: referralUrl, role, referralCount }),
  });

  console.info("[WAITLIST_EMAIL] send_result", {
    requestId,
    to: maskEmail(email),
    hasResendKey: Boolean(process.env.RESEND_API_KEY),
    resendResponsePresent: Boolean(result),
    resendId: (result as { id?: string } | null | undefined)?.id ?? null,
  });
  if (process.env.RESEND_API_KEY && result) {
    await db
      .update(waitlistSignups)
      .set({ lastConfirmationEmailSentAt: new Date() })
      .where(eq(waitlistSignups.id, created.id));

    console.info("[WAITLIST_EMAIL] updated_last_sent", { requestId, signupId: created.id });
  }

  return NextResponse.json({
    ok: true,
    status: "joined" as const,
    message: "You're on the waitlist!",
    referralCode: created.referralCode,
    referralUrl,
    referralCount,
  });
}
