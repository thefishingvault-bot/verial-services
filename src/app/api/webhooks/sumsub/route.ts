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

function safeTimingEqualHex(aHex: string, bHex: string): boolean {
  const a = aHex.trim().toLowerCase();
  const b = bHex.trim().toLowerCase();

  // timingSafeEqual requires equal-length buffers.
  if (a.length !== b.length) return false;
  // Basic hex validation.
  if (!/^[0-9a-f]+$/.test(a) || !/^[0-9a-f]+$/.test(b) || a.length % 2 !== 0) return false;

  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

function verifySumsubWebhook(rawBody: string, payloadDigest: string, payloadDigestAlg: string | null): {
  ok: boolean;
  computed: string;
  algUsed: string;
  algHeader: string | null;
} {
  const secret = process.env.SUMSUB_WEBHOOK_SECRET;
  if (!secret) {
    return { ok: false, computed: "", algUsed: "", algHeader: payloadDigestAlg };
  }

  const algHeader = payloadDigestAlg?.trim() || null;
  // Sumsub uses x-payload-digest-alg like "HMAC_SHA256_HEX".
  // If it's missing, default to SHA256 but log it.
  const normalizedAlg = (algHeader ?? "HMAC_SHA256_HEX").toUpperCase();
  const supportsSha256 = normalizedAlg.includes("SHA256") && normalizedAlg.includes("HMAC");
  if (!supportsSha256) {
    return { ok: false, computed: "", algUsed: normalizedAlg, algHeader };
  }

  const computed = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return {
    ok: safeTimingEqualHex(computed, payloadDigest),
    computed,
    algUsed: "HMAC_SHA256_HEX",
    algHeader,
  };
}

export async function POST(req: Request) {
  // Verify using the RAW body (no JSON re-stringify).
  const rawBody = await req.text();
  const headersList = await headers();

  const payloadDigest = headersList.get("x-payload-digest");
  const payloadDigestAlg = headersList.get("x-payload-digest-alg");

  const headerPresence = {
    hasPayloadDigest: !!payloadDigest,
    hasPayloadDigestAlg: !!payloadDigestAlg,
    // Legacy/other signature headers that might be present depending on Sumsub settings.
    hasXSig: !!headersList.get("x-sumsub-signature"),
    hasXSignature: !!headersList.get("x-signature"),
    hasXHookSignature: !!headersList.get("x-hook-signature"),
  };

  const secretConfigured = !!process.env.SUMSUB_WEBHOOK_SECRET;
  const isProd = process.env.NODE_ENV === "production";

  if (!secretConfigured) {
    if (isProd) {
      console.warn("[API_SUMSUB_WEBHOOK] Missing SUMSUB_WEBHOOK_SECRET in production");
      return new NextResponse("Webhook not configured", { status: 500 });
    }
    console.warn("[API_SUMSUB_WEBHOOK] Dev bypass: no SUMSUB_WEBHOOK_SECRET configured", {
      ...headerPresence,
      alg: payloadDigestAlg,
    });
  } else {
    if (!payloadDigest) {
      if (isProd) {
        console.warn("[API_SUMSUB_WEBHOOK] Missing x-payload-digest header", {
          ...headerPresence,
          alg: payloadDigestAlg,
        });
        return new NextResponse("Missing signature", { status: 401 });
      }
      console.warn("[API_SUMSUB_WEBHOOK] Dev bypass: missing x-payload-digest", {
        ...headerPresence,
        alg: payloadDigestAlg,
      });
    } else {
      const verification = verifySumsubWebhook(rawBody, payloadDigest, payloadDigestAlg);

      if (!verification.ok) {
        console.warn("[API_SUMSUB_WEBHOOK] Webhook signature verification failed", {
          ...headerPresence,
          alg: verification.algHeader,
          algUsed: verification.algUsed,
        });
        return new NextResponse("Invalid signature", { status: 401 });
      }

      console.info("[API_SUMSUB_WEBHOOK] Webhook signature verified", {
        ...headerPresence,
        alg: verification.algHeader,
        algUsed: verification.algUsed,
      });
    }
  }

  let payload: SumsubWebhookPayload;
  try {
    payload = rawBody ? (JSON.parse(rawBody) as SumsubWebhookPayload) : {};
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
