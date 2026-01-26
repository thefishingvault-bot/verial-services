import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { sql, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { waitlistSignups } from "@/db/schema";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

const CONFIRMATION_EMAIL_COOLDOWN_DAYS = 7;

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

function shouldSendConfirmationEmail(lastSentAt: Date | null | undefined) {
  if (!lastSentAt) return true;
  const ms = Date.now() - lastSentAt.getTime();
  return ms > CONFIRMATION_EMAIL_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
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

  return `
  <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5;">
    <h2>You’re on the Verial waitlist</h2>
    <p>${headline}</p>
    <p>We’ll email you when Verial is ready in your area.</p>

    <h3>Move up the list</h3>
    <p>Invite friends using your referral link:</p>
    <p><a href="${referralLink}">${referralLink}</a></p>
    <p>You’ve referred <strong>${referralCount}</strong> people. Refer 3 to move up the list.</p>

    <p style="color: #666; font-size: 12px;">If you didn’t request this, you can ignore this email.</p>
  </div>
  `.trim();
}

export async function POST(req: Request) {
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
  const email = normalizeLooseText(parsed.data.email);
  const emailLower = email.toLowerCase();
  const suburbCity = normalizeLooseText(parsed.data.suburbCity);
  const suburbCityNorm = normalizeForSearch(suburbCity);

  const categoryText = role === "provider" ? normalizeLooseText(parsed.data.categoryText ?? "") : null;
  const categoryNorm = role === "provider" ? normalizeForSearch(categoryText ?? "") : null;
  const yearsExperience = parsed.data.yearsExperience ?? null;

  const ref = parsed.data.ref ? parsed.data.ref.trim().toUpperCase() : null;

  const existing = await db.query.waitlistSignups.findFirst({
    where: (w, { eq }) => eq(w.emailLower, emailLower),
  });

  const origin = safeOriginFromRequest(req);

  if (existing) {
    const referralCount = await referralCountForSignupId(existing.id);
    const referralLink = `${origin}/waitlist?ref=${encodeURIComponent(existing.referralCode)}`;

    const sendOk = shouldSendConfirmationEmail(existing.lastConfirmationEmailSentAt);
    if (sendOk) {
      const result = await sendEmail({
        to: existing.email,
        subject: "You’re on the Verial waitlist",
        html: buildWaitlistEmailHtml({ referralLink, role: existing.role, referralCount }),
      });
      if (process.env.RESEND_API_KEY && result) {
        await db
          .update(waitlistSignups)
          .set({ lastConfirmationEmailSentAt: new Date() })
          .where(eq(waitlistSignups.id, existing.id));
      }
    }

    return NextResponse.json({
      status: "already_exists" as const,
      role: existing.role,
      email: existing.email,
      suburbCity: existing.suburbCity,
      referralCode: existing.referralCode,
      referralLink,
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

  const id = crypto.randomUUID();

  let created: { id: string; role: "provider" | "customer"; referralCode: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
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
    } catch {
      // Likely a referralCode collision; retry.
    }
  }

  if (!created) {
    return NextResponse.json({ error: "Unable to create waitlist signup" }, { status: 500 });
  }

  const referralCount = 0;
  const referralLink = `${origin}/waitlist?ref=${encodeURIComponent(created.referralCode)}`;

  const result = await sendEmail({
    to: email,
    subject: "You’re on the Verial waitlist",
    html: buildWaitlistEmailHtml({ referralLink, role, referralCount }),
  });
  if (process.env.RESEND_API_KEY && result) {
    await db
      .update(waitlistSignups)
      .set({ lastConfirmationEmailSentAt: new Date() })
      .where(eq(waitlistSignups.id, created.id));
  }

  return NextResponse.json({
    status: "created" as const,
    role: created.role,
    email,
    suburbCity,
    referralCode: created.referralCode,
    referralLink,
    referralCount,
  });
}
