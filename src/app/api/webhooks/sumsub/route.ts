import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import crypto from "crypto";

export const runtime = "nodejs";

type SumsubWebhookPayload = Record<string, unknown>;

function pickExternalUserId(payload: SumsubWebhookPayload): string | null {
  const candidates: unknown[] = [
    payload.externalUserId,
    payload.applicantExternalId,
    (payload.applicant as any)?.externalUserId,
    (payload.review as any)?.externalUserId,
    (payload.applicant as any)?.externalUserId,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

function mapKycStatus(payload: SumsubWebhookPayload): {
  kycStatus: "not_started" | "in_progress" | "pending_review" | "verified" | "rejected";
  setSubmittedAt: boolean;
  setVerifiedAt: boolean;
} | null {
  const reviewStatus = typeof payload.reviewStatus === "string" ? payload.reviewStatus : null;
  const reviewResult = payload.reviewResult as any;
  const reviewAnswer = typeof reviewResult?.reviewAnswer === "string" ? reviewResult.reviewAnswer : null;

  // Best-effort mapping to our enum:
  // - pending / queued / onHold -> pending_review
  // - completed + GREEN -> verified
  // - completed + RED -> rejected
  // - anything else -> in_progress

  if (reviewStatus) {
    const normalized = reviewStatus.toLowerCase();

    if (normalized.includes("pending") || normalized.includes("queued") || normalized.includes("onhold")) {
      return { kycStatus: "pending_review", setSubmittedAt: true, setVerifiedAt: false };
    }

    if (normalized.includes("completed")) {
      if (reviewAnswer === "GREEN") {
        return { kycStatus: "verified", setSubmittedAt: true, setVerifiedAt: true };
      }
      if (reviewAnswer === "RED") {
        return { kycStatus: "rejected", setSubmittedAt: true, setVerifiedAt: false };
      }
      return { kycStatus: "pending_review", setSubmittedAt: true, setVerifiedAt: false };
    }
  }

  if (reviewAnswer === "GREEN") {
    return { kycStatus: "verified", setSubmittedAt: true, setVerifiedAt: true };
  }

  if (reviewAnswer === "RED") {
    return { kycStatus: "rejected", setSubmittedAt: true, setVerifiedAt: false };
  }

  return { kycStatus: "in_progress", setSubmittedAt: false, setVerifiedAt: false };
}

function verifyWebhook(body: string, signatureHeader: string | null): boolean {
  const secret = process.env.SUMSUB_WEBHOOK_SECRET;
  if (!secret) {
    return true; // verification not configured
  }

  if (!signatureHeader) {
    return false;
  }

  // Sumsub webhook signature header format varies by configuration.
  // We support a simple HMAC-SHA256 hex digest of the raw body.
  const digest = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signatureHeader));
}

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();

  const signatureHeader =
    headersList.get("x-sumsub-signature") ||
    headersList.get("x-payload-digest") ||
    headersList.get("x-signature") ||
    headersList.get("x-hook-signature");

  const secretConfigured = !!process.env.SUMSUB_WEBHOOK_SECRET;
  if (!secretConfigured) {
    console.warn("[API_SUMSUB_WEBHOOK] Webhook verification disabled: no secret configured");
  }
  if (secretConfigured && !verifyWebhook(body, signatureHeader)) {
    console.warn("[API_SUMSUB_WEBHOOK] Webhook signature verification failed");
    return new NextResponse("Invalid signature", { status: 400 });
  }

  let payload: SumsubWebhookPayload;
  try {
    payload = body ? (JSON.parse(body) as SumsubWebhookPayload) : {};
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const externalUserId = pickExternalUserId(payload);
  if (!externalUserId) {
    console.warn("[API_SUMSUB_WEBHOOK] Missing externalUserId in payload");
    return new NextResponse(null, { status: 200 });
  }

  const mapped = mapKycStatus(payload);
  if (!mapped) {
    return new NextResponse(null, { status: 200 });
  }

  try {
    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, externalUserId),
      columns: { id: true, kycSubmittedAt: true, kycVerifiedAt: true },
    });

    if (!provider) {
      console.warn(`[API_SUMSUB_WEBHOOK] Provider not found for userId=${externalUserId}`);
      return new NextResponse(null, { status: 200 });
    }

    const now = new Date();

    await db
      .update(providers)
      .set({
        kycStatus: mapped.kycStatus,
        kycSubmittedAt: mapped.setSubmittedAt ? provider.kycSubmittedAt ?? now : provider.kycSubmittedAt,
        kycVerifiedAt: mapped.setVerifiedAt ? provider.kycVerifiedAt ?? now : provider.kycVerifiedAt,
        updatedAt: now,
      })
      .where(eq(providers.id, provider.id));

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    console.error("[API_SUMSUB_WEBHOOK] DB update error:", error);
    return new NextResponse("Server error", { status: 500 });
  }
}
