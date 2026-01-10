import { subDays } from "date-fns";
import { and, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { calculateEarnings } from "@/lib/earnings";
import { getPlatformFeeBpsForPlan, normalizeProviderPlan } from "@/lib/provider-subscription";
import { bookings, providerEarnings, providers, services } from "@/db/schema";

export type ProviderEarningsSummary = {
  lifetime: { gross: number; fee: number; gst: number; net: number };
  last30: { gross: number; fee: number; gst: number; net: number };
  pendingPayoutsNet: number;
  paidOutNet: number;
};

export async function getProviderEarningsSummary(providerId: string): Promise<ProviderEarningsSummary> {
  const thirtyDaysAgo = subDays(new Date(), 30);

  const [paidOutTotals, last30PaidOutTotals, pendingFromEarningsRow, missingBookings] = await Promise.all([
    // Lifetime earnings = actually paid out.
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

    // Last 30 days = paid out in the last 30 days.
    // We use the earning row's updatedAt as the best available timestamp for the status transition.
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

    // Pending payouts = completed bookings that are eligible and have not been paid out yet.
    // Prefer the ledger (provider_earnings) when present.
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

    // Fallback: completed + paid bookings that don't have an earnings row (webhook/reconciliation gaps).
    // Compute net deterministically using our fee/GST logic.
    db
      .select({
        bookingId: bookings.id,
        priceAtBooking: bookings.priceAtBooking,
        paymentIntentId: bookings.paymentIntentId,
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

  let pendingFromMissingBookings = 0;
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
  }

  const paidOutNet = Number(paidOutTotals?.net ?? 0);

  return {
    lifetime: {
      gross: Number(paidOutTotals?.gross ?? 0),
      fee: Number(paidOutTotals?.fee ?? 0),
      gst: Number(paidOutTotals?.gst ?? 0),
      net: paidOutNet,
    },
    last30: {
      gross: Number(last30PaidOutTotals?.gross ?? 0),
      fee: Number(last30PaidOutTotals?.fee ?? 0),
      gst: Number(last30PaidOutTotals?.gst ?? 0),
      net: Number(last30PaidOutTotals?.net ?? 0),
    },
    pendingPayoutsNet: pendingFromEarnings + pendingFromMissingBookings,
    paidOutNet,
  };
}
