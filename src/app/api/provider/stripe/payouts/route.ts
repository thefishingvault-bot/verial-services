import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providerEarnings, providerPayouts, providers } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import { assertProviderCanTransactFromProvider } from "@/lib/provider-access";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
    });

    if (!provider || !provider.stripeConnectId) {
      return new NextResponse("Provider not connected", { status: 404 });
    }

    const access = assertProviderCanTransactFromProvider(provider);
    if (!access.ok) return access.response;

    // 1) Fetch latest payouts from Stripe
    const stripePayouts = await stripe.payouts.list(
      { limit: 50 },
      { stripeAccount: provider.stripeConnectId },
    );

    // 2) Upsert provider_payouts
    for (const p of stripePayouts.data) {
      await db
        .insert(providerPayouts)
        .values({
          id: p.id,
          providerId: provider.id,
          stripeAccountId: provider.stripeConnectId,
          stripePayoutId: p.id,
          amount: p.amount,
          currency: p.currency,
          status: mapPayoutStatus(p.status),
          arrivalDate: p.arrival_date ? new Date(p.arrival_date * 1000) : null,
          estimatedArrival: p.arrival_date ? new Date(p.arrival_date * 1000) : null,
          stripeCreatedAt: p.created ? new Date(p.created * 1000) : null,
          raw: p,
          failureCode: p.failure_code || null,
          failureMessage: p.failure_message || null,
          balanceTransactionId: typeof p.balance_transaction === "string" ? p.balance_transaction : null,
        })
        .onConflictDoUpdate({
          target: providerPayouts.id,
          set: {
            stripeAccountId: provider.stripeConnectId,
            amount: p.amount,
            currency: p.currency,
            status: mapPayoutStatus(p.status),
            arrivalDate: p.arrival_date ? new Date(p.arrival_date * 1000) : null,
            estimatedArrival: p.arrival_date ? new Date(p.arrival_date * 1000) : null,
            stripeCreatedAt: p.created ? new Date(p.created * 1000) : null,
            raw: p,
            failureCode: p.failure_code || null,
            failureMessage: p.failure_message || null,
            balanceTransactionId: typeof p.balance_transaction === "string" ? p.balance_transaction : null,
            updatedAt: new Date(),
          },
        });

      // Link earnings to this payout using balance transactions associated to the payout
      const txPage = await stripe.balanceTransactions.list(
        { payout: p.id, limit: 100 },
        { stripeAccount: provider.stripeConnectId },
      );

      const txIds = txPage.data.map((tx) => tx.id);
      if (txIds.length > 0) {
        await db
          .update(providerEarnings)
          .set({
            payoutId: p.id,
            status: p.status === "paid" ? "paid_out" : "awaiting_payout",
            updatedAt: new Date(),
          })
          .where(
            and(
              inArray(providerEarnings.stripeBalanceTransactionId, txIds),
              eq(providerEarnings.providerId, provider.id),
            ),
          );
      }
    }

    return NextResponse.json({
      currency: stripePayouts.data[0]?.currency || "nzd",
      payouts: stripePayouts.data.map((p) => ({
        id: p.id,
        amount: p.amount,
        status: p.status,
        arrivalDate: p.arrival_date,
        created: p.created,
        method: p.method,
        type: p.type,
      })),
    });
  } catch (error) {
    console.error("[API_PROVIDER_STRIPE_PAYOUTS]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

function mapPayoutStatus(status: string) {
  switch (status) {
    case "paid":
      return "paid";
    case "in_transit":
      return "in_transit";
    case "pending":
      return "pending";
    case "canceled":
      return "canceled";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}
