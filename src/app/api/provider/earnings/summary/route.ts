import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, providerEarnings, providerPayouts, providers, services } from "@/db/schema";
import { subDays } from "date-fns";

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
        chargesEnabled: provider.chargesEnabled ?? false,
        payoutsEnabled: provider.payoutsEnabled ?? false,
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
