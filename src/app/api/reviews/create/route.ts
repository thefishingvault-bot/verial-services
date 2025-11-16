import { db } from "@/lib/db";
import { reviews, bookings, services } from "@/db/schema";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";

// Helper function to create a unique ID
const generateReviewId = () =>
  `rev_${new Date().getTime()}_${Math.random().toString(36).substring(2, 9)}`;

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { bookingId, rating, comment } = await req.json();
    if (!bookingId || !rating) {
      return new NextResponse("Missing bookingId or rating", { status: 400 });
    }
    if (rating < 1 || rating > 5) {
      return new NextResponse("Rating must be between 1 and 5", { status: 400 });
    }

    // 1. Find the booking
    const booking = await db.query.bookings.findFirst({
      where: and(
        eq(bookings.id, bookingId),
        eq(bookings.userId, userId) // Security: Only the user who booked can review
      ),
    });

    if (!booking) {
      return new NextResponse("Booking not found or access denied", { status: 404 });
    }

    // 2. Check if booking is completed
    // (For now, we'll allow reviews on 'paid' or 'completed' for testing)
    if (booking.status !== "paid" && booking.status !== "completed") {
      return new NextResponse(
        `Cannot review a booking with status: ${booking.status}`,
        { status: 400 }
      );
    }

    // 3. Create the review
    const [newReview] = await db
      .insert(reviews)
      .values({
        id: generateReviewId(),
        userId: userId,
        providerId: booking.providerId,
        bookingId: booking.id,
        rating,
        comment,
      })
      .returning();

    // --- TODO: Trigger trust score recompute for the provider ---

    console.log(
      `[API_REVIEW_CREATE] User ${userId} created Review ${newReview.id} for Booking ${booking.id}`
    );

    // --- 4. Notify Provider ---
    try {
      const service = await db.query.services.findFirst({
        where: eq(services.id, booking.serviceId),
        with: { provider: { columns: { handle: true } } },
      });

      await createNotification({
        userId: booking.providerId,
        message: `You received a ${rating}-star review on ${service?.title ?? "your service"}!`,
        href: `/p/${service?.provider?.handle ?? ""}`,
      });
    } catch (notifError) {
      console.error("[API_REVIEW_CREATE] Failed to send notification:", notifError);
    }

    return NextResponse.json(newReview);
  } catch (error: unknown) {
    // Check for unique constraint violation on 'bookingId'
    if (typeof error === 'object' && error !== null) {
      const pgError = error as { code?: string; constraint?: string };
      if (pgError.code === "23505" && pgError.constraint?.includes("reviews_booking_id_unique")) {
        return new NextResponse("A review already exists for this booking.", { status: 409 });
      }
    }
    console.error("[API_REVIEW_CREATE]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

