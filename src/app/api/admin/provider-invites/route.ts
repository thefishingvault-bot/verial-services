import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

import { db } from "@/lib/db";
import { providerInvites } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-auth";
import { ensureUserExistsInDb } from "@/lib/user-sync";
import { sendEmailWithResult } from "@/lib/email";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

function normalizeEmail(email: string) {
  const trimmed = email.trim();
  return { email: trimmed, emailLower: trimmed.toLowerCase() };
}

function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function isUniqueViolation(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "23505";
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const { userId } = admin;
    await ensureUserExistsInDb(userId!, "admin");

    const raw = await request.json().catch(() => null) as unknown;
    const body = raw && typeof raw === "object" ? (raw as { emails?: unknown; notes?: unknown }) : null;

    const emailsRaw = Array.isArray(body?.emails) ? body?.emails : null;
    if (!emailsRaw || emailsRaw.length === 0) {
      return NextResponse.json({ error: "Missing emails" }, { status: 400 });
    }

    const emails = emailsRaw
      .filter((e): e is string => typeof e === "string")
      .map((e) => e.trim())
      .filter(Boolean);

    if (emails.length === 0) {
      return NextResponse.json({ error: "No valid emails provided" }, { status: 400 });
    }

    // De-dupe by emailLower
    const uniqueByLower = new Map<string, string>();
    for (const e of emails) uniqueByLower.set(e.toLowerCase(), e);

    const notes = typeof body?.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

    const origin = request.headers.get("origin") || new URL(request.url).origin;
    const publicBase = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || origin;

    const created: Array<{ id: string; email: string; token: string; status: string }> = [];

    for (const email of uniqueByLower.values()) {
      const { email: normalizedEmail, emailLower } = normalizeEmail(email);

      let inserted = false;

      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const token = generateToken(32);
        try {
          const [row] = await db
            .insert(providerInvites)
            .values({
              email: normalizedEmail,
              emailLower,
              token,
              status: "pending",
              createdByUserId: userId!,
              notes,
            })
            .returning({
              id: providerInvites.id,
              email: providerInvites.email,
              token: providerInvites.token,
              status: providerInvites.status,
            });

          if (row) {
            created.push({ id: row.id, email: row.email, token: row.token, status: row.status });
            inserted = true;
            break;
          }
        } catch (err) {
          lastErr = err;
          if (isUniqueViolation(err)) {
            continue;
          }
          throw err;
        }
      }

      if (!inserted) {
        return NextResponse.json({ error: "Failed to create invite", details: lastErr ? "db_error" : undefined }, { status: 500 });
      }
    }

    const now = new Date();

    const invites = [] as Array<{
      id: string;
      email: string;
      status: string;
      inviteUrlCurrent: string;
      inviteUrlPublic: string;
      emailStatus: "not_sent" | "sent" | "failed";
      emailSentAt: string | null;
      emailResendId: string | null;
      emailError: string | null;
    }>;

    for (const i of created) {
      const path = `/invite/provider?token=${encodeURIComponent(i.token)}`;
      const inviteUrlCurrent = `${origin}${path}`;
      const inviteUrlPublic = `${publicBase}${path}`;

      const to = i.email;
      const subject = "Your early access link to Verial";
      const html = `
        <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;line-height:1.5">
          <h2 style="margin:0 0 12px 0">You're invited to Verial</h2>
          <p style="margin:0 0 12px 0">Use this link to redeem early provider access:</p>
          <p style="margin:0 0 16px 0"><a href="${inviteUrlPublic}">${inviteUrlPublic}</a></p>
          <p style="margin:0;color:#6b7280;font-size:12px">If you didn’t request this, you can ignore this email.</p>
        </div>
      `.trim();

      console.info("[PROVIDER_INVITE_EMAIL] send_attempt", {
        inviteId: i.id,
        to,
        subject,
        publicBase,
      });

      const sendResult = await sendEmailWithResult({ to, subject, html });

      if (sendResult.ok) {
        await db
          .update(providerInvites)
          .set({
            inviteEmailSentAt: now,
            inviteEmailTo: to,
            inviteEmailResendId: sendResult.id,
            inviteEmailError: null,
          })
          .where(eq(providerInvites.id, i.id));

        invites.push({
          id: i.id,
          email: i.email,
          status: i.status,
          inviteUrlCurrent,
          inviteUrlPublic,
          emailStatus: "sent",
          emailSentAt: now.toISOString(),
          emailResendId: sendResult.id,
          emailError: null,
        });
      } else {
        await db
          .update(providerInvites)
          .set({
            inviteEmailSentAt: null,
            inviteEmailTo: to,
            inviteEmailResendId: null,
            inviteEmailError: sendResult.error,
          })
          .where(eq(providerInvites.id, i.id));

        console.error("[PROVIDER_INVITE_EMAIL] send_failed", {
          inviteId: i.id,
          to,
          subject,
          error: sendResult.error,
        });

        invites.push({
          id: i.id,
          email: i.email,
          status: i.status,
          inviteUrlCurrent,
          inviteUrlPublic,
          emailStatus: "failed",
          emailSentAt: null,
          emailResendId: null,
          emailError: sendResult.error,
        });
      }
    }

    const failures = invites.filter((i) => i.emailStatus === "failed");
    if (failures.length > 0) {
      console.warn("[PROVIDER_INVITE_EMAIL] some_failed", { failed: failures.length, total: invites.length });
    }

    return NextResponse.json({
      ok: true,
      invites,
      errorBanner: failures.length > 0 ? `Failed to send ${failures.length} invite email${failures.length === 1 ? "" : "s"}.` : null,
    });
  } catch (error) {
    console.error("[API_ADMIN_PROVIDER_INVITES]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
