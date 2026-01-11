import { db } from "@/lib/db";
import { bookings, reviews } from "@/db/schema";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, desc, inArray, and } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Find all bookings for this user
    const userBookings = await db.query.bookings.findMany({
      where: eq(bookings.userId, userId),
      with: {
        service: {
          columns: { title: true, slug: true, pricingType: true },
        },
        provider: {
          columns: {
            id: true,
            businessName: true,
            handle: true,
            stripeConnectId: true,
            isVerified: true,
            trustLevel: true,
            baseSuburb: true,
            baseRegion: true,
            serviceRadiusKm: true,
          },
        },
      },
      orderBy: [desc(bookings.createdAt)],
    });

    const bookingIds = userBookings.map((b) => b.id);
    const reviewRows = bookingIds.length
      ? await db
          .select({ bookingId: reviews.bookingId, id: reviews.id })
          .from(reviews)
          .where(and(eq(reviews.userId, userId), inArray(reviews.bookingId, bookingIds)))
      : [];

    const reviewByBookingId = new Map(reviewRows.map((r) => [r.bookingId, r.id] as const));

    const enriched = userBookings.map((b) => {
      const reviewId = reviewByBookingId.get(b.id) ?? null;
      return {
        ...b,
        hasReview: Boolean(reviewId),
        review: reviewId ? { id: reviewId } : null,
      };
    });

    return NextResponse.json(enriched, {
      headers: {
        "Cache-Control": "no-store",
      },
    });

  } catch (error) {
    console.error("[API_USER_BOOKINGS_LIST]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

