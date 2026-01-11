import { subDays } from "date-fns";
import { and, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { calculateEarnings } from "@/lib/earnings";
import { getPlatformFeeBpsForPlan, normalizeProviderPlan } from "@/lib/provider-subscription";
import { bookings, earningStatusEnum, providerEarnings, providerPayouts, providers, services } from "@/db/schema";

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

  // NOTE: Cast enum columns to text in queries to avoid runtime 500s when a database
  // is behind on enum migrations (e.g., missing 'held' / 'completed_by_provider').
  // This keeps the provider dashboard working while migrations catch up.
  const earnedStatuses = ["held", "transferred", "awaiting_payout", "paid_out"];

  const [earnedTotals, last30EarnedTotals, paidOutRow, missingBookings] = await Promise.all([
    // Earned totals (lifetime): include held + transferred (and legacy statuses).
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
          inArray(sql<string>`(${providerEarnings.status})::text`, earnedStatuses),
        ),
      )
      .then((rows) => rows[0]),

    // Earned totals (last 30 days): use paidAt where available, otherwise createdAt.
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
          inArray(sql<string>`(${providerEarnings.status})::text`, earnedStatuses),
          gte(sql<Date>`coalesce(${providerEarnings.paidAt}, ${providerEarnings.createdAt})`, thirtyDaysAgo),
        ),
      )
      .then((rows) => rows[0]),

    // Stripe-driven paid-out total (net): sum actual payouts that reached the provider's bank.
    db
      .select({ cents: sql<number>`coalesce(sum(${providerPayouts.amount}), 0)` })
      .from(providerPayouts)
      .where(
        and(
          eq(providerPayouts.providerId, providerId),
          inArray(providerPayouts.status, ["paid", "in_transit"]),
        ),
      )
      .then((rows) => rows[0]),

    // Fallback for paid bookings without earnings rows (webhook/reconciliation gaps).
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
          inArray(sql<string>`(${bookings.status})::text`, ["paid", "completed_by_provider", "completed"]),
          isNotNull(bookings.paymentIntentId),
          isNull(providerEarnings.id),
        ),
      )
      .then((rows) => rows),
  ]);

  let earnedFromMissingBookings = 0;
  let last30EarnedFromMissingBookings = 0;
  for (const row of missingBookings) {
    const plan = normalizeProviderPlan(row.providerPlan);
    const platformFeeBps = getPlatformFeeBpsForPlan(plan);
    const chargesGst = row.serviceChargesGst ?? row.providerChargesGst ?? true;

    const breakdown = calculateEarnings({
      amountInCents: row.priceAtBooking,
      chargesGst,
      platformFeeBps,
    });

    earnedFromMissingBookings += breakdown.netAmount;
    if (row.bookingUpdatedAt && row.bookingUpdatedAt >= thirtyDaysAgo) {
      last30EarnedFromMissingBookings += breakdown.netAmount;
    }
  }

  const paidOutNet = Number(paidOutRow?.cents ?? 0);

  const earnedNet = Number(earnedTotals?.net ?? 0) + earnedFromMissingBookings;
  const earnedLast30Net = Number(last30EarnedTotals?.net ?? 0) + last30EarnedFromMissingBookings;

  // Pending to bank payout (net) = earned - paid out.
  const pendingPayoutsNet = Math.max(0, earnedNet - paidOutNet);

  return {
    lifetime: {
      gross: Number(earnedTotals?.gross ?? 0),
      fee: Number(earnedTotals?.fee ?? 0),
      gst: Number(earnedTotals?.gst ?? 0),
      net: earnedNet,
    },
    last30: {
      gross: Number(last30EarnedTotals?.gross ?? 0),
      fee: Number(last30EarnedTotals?.fee ?? 0),
      gst: Number(last30EarnedTotals?.gst ?? 0),
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

  const paidOutNet = Number(summary.paidOutNet ?? 0);
  const earnedNet = Number(summary.lifetime.net ?? 0);
  const pendingNet = Math.max(0, earnedNet - paidOutNet);

  return {
    lifetimeEarnedNet: earnedNet,
    last30DaysEarnedNet: Number(summary.last30.net ?? 0),
    pendingNet,
    paidOutNet,
  };
}
