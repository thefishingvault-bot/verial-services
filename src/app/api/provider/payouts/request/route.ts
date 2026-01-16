import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

import { db } from "@/lib/db";
import { providerPayoutRequests, providers } from "@/db/schema";
import { assertProviderCanTransactFromProvider } from "@/lib/provider-access";
import { getProviderMoneySummary } from "@/server/providers/earnings";

export const runtime = "nodejs";

function payoutsDisabledByEnv(): boolean {
  const raw = process.env.DISABLE_PAYOUTS;
  if (raw == null || raw === "") return true;

  const normalized = raw.trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

function readIdempotencyKey(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const key = (body as Record<string, unknown>)["idempotencyKey"];
  if (typeof key !== "string") return null;
  const trimmed = key.trim();
  return trimmed.length ? trimmed : null;
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
      columns: {
        id: true,
        userId: true,
        stripeConnectId: true,
        payoutsEnabled: true,
        isSuspended: true,
        suspensionReason: true,
        suspensionStartDate: true,
        suspensionEndDate: true,
      },
    });

    if (!provider) {
      return new NextResponse("Provider not found", { status: 404 });
    }

    const access = assertProviderCanTransactFromProvider(provider);
    if (!access.ok) return access.response;

    const payoutsDisabled = payoutsDisabledByEnv();

    // If payouts are enabled (flag off), ensure the provider is connected and allowed.
    if (!payoutsDisabled) {
      if (!provider.stripeConnectId) {
        return new NextResponse("Provider not connected", { status: 400 });
      }
      if (!provider.payoutsEnabled) {
        return new NextResponse("Provider payouts are not enabled", { status: 400 });
      }
    }

    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    const idempotencyKey = readIdempotencyKey(body);
    if (!idempotencyKey) {
      return new NextResponse("Missing idempotencyKey", { status: 400 });
    }

    const money = await getProviderMoneySummary(provider.id);
    const pendingNetCents = Number(money.pendingNet ?? 0);

    if (!Number.isFinite(pendingNetCents) || pendingNetCents <= 0) {
      return new NextResponse("No pending payout available", { status: 409 });
    }

    const requestId = `preq_${randomUUID()}`;

    // Insert (idempotent). If already exists, return the existing record.
    await db
      .insert(providerPayoutRequests)
      .values({
        id: requestId,
        providerId: provider.id,
        amount: pendingNetCents,
        currency: "nzd",
        status: "queued",
        idempotencyKey,
        payoutsDisabled,
        note: payoutsDisabled ? "payouts disabled" : null,
        updatedAt: new Date(),
      })
      .onConflictDoNothing({
        target: [providerPayoutRequests.providerId, providerPayoutRequests.idempotencyKey],
      });

    const record = await db.query.providerPayoutRequests.findFirst({
      where: and(
        eq(providerPayoutRequests.providerId, provider.id),
        eq(providerPayoutRequests.idempotencyKey, idempotencyKey),
      ),
      columns: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        payoutsDisabled: true,
        note: true,
      },
    });

    return NextResponse.json({
      ok: true,
      request: record ?? {
        id: requestId,
        amount: pendingNetCents,
        currency: "nzd",
        status: "queued",
        payoutsDisabled,
        note: payoutsDisabled ? "payouts disabled" : null,
      },
    });
  } catch (error) {
    console.error("[API_PROVIDER_PAYOUT_REQUEST]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
