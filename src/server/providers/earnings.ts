import { subDays } from "date-fns";
import { and, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { calculateEarnings } from "@/lib/earnings";
import { getPlatformFeeBpsForPlan, normalizeProviderPlan } from "@/lib/provider-subscription";
import { bookings, providerEarnings, providerPayouts, providers, services } from "@/db/schema";

export type ProviderEarningsSummary = {
  lifetime: { gross: number; fee: number; gst: number; net: number };
  last30: { gross: number; fee: number; gst: number; net: number };
  pendingPayoutsNet: number;
  paidOutNet: number;
};

export type ProviderMoneySummary = {
  lifetimeEarnedNet: number;
  last30DaysEarnedNet: number;
  pendingNet: number;
  paidOutNet: number;
};

export async function getProviderEarningsSummary(providerId: string): Promise<ProviderEarningsSummary> {
  const thirtyDaysAgo = subDays(new Date(), 30);

  const [paidOutTotals, last30PaidOutTotals, pendingFromEarningsRow, last30PendingFromEarningsRow, missingBookings] = await Promise.all([
    // Paid out totals (lifetime): actual transfers made to the provider.
    db
      .select({
        gross: sql<number>`coalesce(sum(${providerEarnings.grossAmount}), 0)`,
        fee: sql<number>`coalesce(sum(${providerEarnings.platformFeeAmount}), 0)`,
        gst: sql<number>`coalesce(sum(${providerEarnings.gstAmount}), 0)`,
        net: sql<number>`coalesce(sum(${providerEarnings.netAmount}), 0)`,
      })
      .from(providerEarnings)
      .where(and(eq(providerEarnings.providerId, providerId), eq(providerEarnings.status, "paid_out")))
      .then((rows) => rows[0]),

    // Paid out in the last 30 days: use updatedAt as a proxy for the paid_out transition.
    db
      .select({
        gross: sql<number>`coalesce(sum(${providerEarnings.grossAmount}), 0)`,
        fee: sql<number>`coalesce(sum(${providerEarnings.platformFeeAmount}), 0)`,
        gst: sql<number>`coalesce(sum(${providerEarnings.gstAmount}), 0)`,
        net: sql<number>`coalesce(sum(${providerEarnings.netAmount}), 0)`,
      })
      .from(providerEarnings)
      .where(
        and(
          eq(providerEarnings.providerId, providerId),
          eq(providerEarnings.status, "paid_out"),
          gte(providerEarnings.updatedAt, thirtyDaysAgo),
        ),
      )
      .then((rows) => rows[0]),

    // Pending transfer (lifetime): completed bookings that are earned but not paid out.
    db
      .select({ net: sql<number>`coalesce(sum(${providerEarnings.netAmount}), 0)` })
      .from(providerEarnings)
      .leftJoin(bookings, eq(bookings.id, providerEarnings.bookingId))
      .where(
        and(
          eq(providerEarnings.providerId, providerId),
          eq(providerEarnings.status, "awaiting_payout"),
          eq(bookings.status, "completed"),
        ),
      )
      .then((rows) => rows[0]),

    // Pending transfer (last 30 days): best-effort filter by booking.updatedAt (no explicit completedAt).
    db
      .select({ net: sql<number>`coalesce(sum(${providerEarnings.netAmount}), 0)` })
      .from(providerEarnings)
      .leftJoin(bookings, eq(bookings.id, providerEarnings.bookingId))
      .where(
        and(
          eq(providerEarnings.providerId, providerId),
          eq(providerEarnings.status, "awaiting_payout"),
          eq(bookings.status, "completed"),
          gte(bookings.updatedAt, thirtyDaysAgo),
        ),
      )
      .then((rows) => rows[0]),

    // Fallback for completed bookings without earnings rows (webhook/reconciliation gaps).
    db
      .select({
        bookingId: bookings.id,
        priceAtBooking: bookings.priceAtBooking,
        paymentIntentId: bookings.paymentIntentId,
        bookingUpdatedAt: bookings.updatedAt,
        serviceChargesGst: services.chargesGst,
        providerChargesGst: providers.chargesGst,
        providerPlan: providers.plan,
      })
      .from(bookings)
      .leftJoin(providerEarnings, eq(providerEarnings.bookingId, bookings.id))
      .leftJoin(services, eq(services.id, bookings.serviceId))
      .leftJoin(providers, eq(providers.id, bookings.providerId))
      .where(
        and(
          eq(bookings.providerId, providerId),
          eq(bookings.status, "completed"),
          isNotNull(bookings.paymentIntentId),
          isNull(providerEarnings.id),
        ),
      )
      .then((rows) => rows),
  ]);

  const pendingFromEarnings = Number(pendingFromEarningsRow?.net ?? 0);
  const last30PendingFromEarnings = Number(last30PendingFromEarningsRow?.net ?? 0);

  let pendingFromMissingBookings = 0;
  let last30PendingFromMissingBookings = 0;
  for (const row of missingBookings) {
    const plan = normalizeProviderPlan(row.providerPlan);
    const platformFeeBps = getPlatformFeeBpsForPlan(plan);
    const chargesGst = row.serviceChargesGst ?? row.providerChargesGst ?? true;

    const breakdown = calculateEarnings({
      amountInCents: row.priceAtBooking,
      chargesGst,
      platformFeeBps,
    });

    pendingFromMissingBookings += breakdown.netAmount;
    if (row.bookingUpdatedAt && row.bookingUpdatedAt >= thirtyDaysAgo) {
      last30PendingFromMissingBookings += breakdown.netAmount;
    }
  }

  const paidOutNet = Number(paidOutTotals?.net ?? 0);
  const pendingPayoutsNet = pendingFromEarnings + pendingFromMissingBookings;
  const last30PendingNet = last30PendingFromEarnings + last30PendingFromMissingBookings;

  // Total earned (net) = pending transfer + paid out.
  const earnedNet = pendingPayoutsNet + paidOutNet;
  const earnedLast30Net = last30PendingNet + Number(last30PaidOutTotals?.net ?? 0);

  return {
    lifetime: {
      gross: 0,
      fee: 0,
      gst: 0,
      net: earnedNet,
    },
    last30: {
      gross: 0,
      fee: 0,
      gst: 0,
      net: earnedLast30Net,
    },
    pendingPayoutsNet,
    paidOutNet,
  };
}

// Shared totals used by provider overview + earnings pages.
// All values are in cents and represent *provider net*.
export async function getProviderMoneySummary(providerId: string): Promise<ProviderMoneySummary> {
  const summary = await getProviderEarningsSummary(providerId);

  // Stripe-driven paid-out total (net): sum actual payouts that reached the provider's bank.
  // Guardrail: if a provider has no payout events (not connected / no payouts yet), this is 0.
  const paidOutRow = await db
    .select({ cents: sql<number>`coalesce(sum(${providerPayouts.amount}), 0)` })
    .from(providerPayouts)
    .where(
      and(
        eq(providerPayouts.providerId, providerId),
        inArray(providerPayouts.status, ["paid", "in_transit"]),
      ),
    )
    .then((rows) => rows[0]);

  const paidOutNet = Number(paidOutRow?.cents ?? 0);
  const earnedNet = Number(summary.lifetime.net ?? 0);
  const pendingNet = Math.max(0, earnedNet - paidOutNet);

  return {
    lifetimeEarnedNet: earnedNet,
    last30DaysEarnedNet: Number(summary.last30.net ?? 0),
    pendingNet,
    paidOutNet,
  };
}
