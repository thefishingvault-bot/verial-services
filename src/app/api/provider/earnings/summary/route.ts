import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, providerEarnings, providerPayouts, providers, services } from "@/db/schema";
import { subDays } from "date-fns";
import { stripe } from "@/lib/stripe";

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

    if (!provider) {
      return new NextResponse("Provider not found", { status: 404 });
    }

    let chargesEnabled = provider.chargesEnabled ?? false;
    let payoutsEnabled = provider.payoutsEnabled ?? false;

    // Fallback sync: if we have a Connect account, refresh status from Stripe so the UI
    // doesn't depend entirely on webhooks.
    if (provider.stripeConnectId) {
      try {
        const account = await stripe.accounts.retrieve(provider.stripeConnectId);
        const latestChargesEnabled = !!account.charges_enabled;
        const latestPayoutsEnabled = !!account.payouts_enabled;
        const currentlyDueCount = Array.isArray(account.requirements?.currently_due)
          ? account.requirements.currently_due.length
          : null;

        // Persist every time (best-effort) so DB is always consistent.
        await db
          .update(providers)
          .set({
            chargesEnabled: latestChargesEnabled,
            payoutsEnabled: latestPayoutsEnabled,
            updatedAt: new Date(),
          })
          .where(eq(providers.id, provider.id));

        console.info("[API_PROVIDER_EARNINGS_SUMMARY] Stripe Connect status synced", {
          providerId: provider.id,
          accountId: provider.stripeConnectId,
          chargesEnabled: latestChargesEnabled,
          payoutsEnabled: latestPayoutsEnabled,
          detailsSubmitted: account.details_submitted,
          currentlyDueCount,
        });

        chargesEnabled = latestChargesEnabled;
        payoutsEnabled = latestPayoutsEnabled;
      } catch (error) {
        console.warn("[API_PROVIDER_EARNINGS_SUMMARY] Failed to sync Stripe Connect status", {
          providerId: provider.id,
          accountId: provider.stripeConnectId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const thirtyDaysAgo = subDays(new Date(), 30);

    const [totals, last30, pendingNet, paidOutNet] = await Promise.all([
      db
        .select({
          gross: sql<number>`coalesce(sum(${providerEarnings.grossAmount}), 0)`,
          fee: sql<number>`coalesce(sum(${providerEarnings.platformFeeAmount}), 0)`,
          gst: sql<number>`coalesce(sum(${providerEarnings.gstAmount}), 0)`,
          net: sql<number>`coalesce(sum(${providerEarnings.netAmount}), 0)`,
        })
        .from(providerEarnings)
        .where(eq(providerEarnings.providerId, provider.id))
        .then((rows) => rows[0]),
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
            eq(providerEarnings.providerId, provider.id),
            gte(providerEarnings.paidAt, thirtyDaysAgo),
          ),
        )
        .then((rows) => rows[0]),
      db
        .select({
          net: sql<number>`coalesce(sum(${providerEarnings.netAmount}), 0)`,
        })
        .from(providerEarnings)
        .where(
          and(
            eq(providerEarnings.providerId, provider.id),
            eq(providerEarnings.status, "awaiting_payout"),
          ),
        )
        .then((rows) => rows[0]),
      db
        .select({
          net: sql<number>`coalesce(sum(${providerEarnings.netAmount}), 0)`,
        })
        .from(providerEarnings)
        .where(
          and(
            eq(providerEarnings.providerId, provider.id),
            eq(providerEarnings.status, "paid_out"),
          ),
        )
        .then((rows) => rows[0]),
    ]);

    const upcomingPayout = await db.query.providerPayouts.findFirst({
      where: and(
        eq(providerPayouts.providerId, provider.id),
        inArray(providerPayouts.status, ["pending", "in_transit"]),
      ),
      orderBy: providerPayouts.arrivalDate,
    });

    const recentBookings = await db
      .select({
        bookingId: providerEarnings.bookingId,
        serviceTitle: services.title,
        bookingStatus: bookings.status,
        payoutStatus: providerEarnings.status,
        grossAmount: providerEarnings.grossAmount,
        platformFeeAmount: providerEarnings.platformFeeAmount,
        gstAmount: providerEarnings.gstAmount,
        netAmount: providerEarnings.netAmount,
        payoutDate: providerPayouts.arrivalDate,
        paidAt: providerEarnings.paidAt,
      })
      .from(providerEarnings)
      .leftJoin(bookings, eq(bookings.id, providerEarnings.bookingId))
      .leftJoin(services, eq(services.id, providerEarnings.serviceId))
      .leftJoin(providerPayouts, eq(providerPayouts.id, providerEarnings.payoutId))
      .where(eq(providerEarnings.providerId, provider.id))
      .orderBy(sql`coalesce(${providerEarnings.paidAt}, ${providerEarnings.createdAt}) desc`)
      .limit(25);

    return NextResponse.json({
      currency: "NZD",
      connect: {
        stripeConnectId: provider.stripeConnectId ?? null,
        chargesEnabled,
        payoutsEnabled,
      },
      lifetime: totals,
      last30,
      pendingPayoutsNet: pendingNet?.net ?? 0,
      completedPayoutsNet: paidOutNet?.net ?? 0,
      upcomingPayout: upcomingPayout
        ? {
            id: upcomingPayout.id,
            amount: upcomingPayout.amount,
            status: upcomingPayout.status,
            arrivalDate: upcomingPayout.arrivalDate,
            estimatedArrival: upcomingPayout.estimatedArrival,
          }
        : null,
      recentBookings,
    });
  } catch (error) {
    console.error("[API_PROVIDER_EARNINGS_SUMMARY]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
