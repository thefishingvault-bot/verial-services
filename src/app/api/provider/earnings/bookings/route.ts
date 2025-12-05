import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, sql, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, providerEarnings, providerPayouts, providers, services } from "@/db/schema";

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

    const rows = await db
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
      .orderBy(desc(sql`coalesce(${providerEarnings.paidAt}, ${providerEarnings.createdAt})`))
      .limit(100);

    return NextResponse.json({ bookings: rows, currency: "NZD" });
  } catch (error) {
    console.error("[API_PROVIDER_EARNINGS_BOOKINGS]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
