import { db } from "@/lib/db";
import { reviews, bookings, services, providers } from "@/db/schema";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { createNotification } from "@/lib/notifications";
import { calculateTrustScore } from "@/lib/trust";
import { ReviewCreateSchema, parseBody } from "@/lib/validation/reviews";

export const runtime = "nodejs";

// Helper function to create a unique ID
const generateReviewId = () =>
  `rev_${new Date().getTime()}_${Math.random().toString(36).substring(2, 9)}`;

export async function POST(req: Request) {
  try {
    const parsed = await parseBody(ReviewCreateSchema, req);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error },
        { status: 400 }
      );
    }

    const { bookingId, rating, comment } = parsed.data;

    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const sanitizedComment = comment;
    if (sanitizedComment && /(http:\/\/|https:\/\/)/i.test(sanitizedComment)) {
      return new NextResponse("Links are not allowed in reviews", { status: 400 });
    }
    if (sanitizedComment && /(spam|scam|fake)/i.test(sanitizedComment) && sanitizedComment.length < 20) {
      return new NextResponse("Review looks like spam", { status: 400 });
    }

    // 1. Find the booking (do NOT trust client for providerId/serviceId)
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
      columns: {
        id: true,
        status: true,
        providerId: true,
        serviceId: true,
        userId: true,
      },
    });

    if (!booking) {
      return new NextResponse("Booking not found", { status: 404 });
    }

    if (booking.userId !== userId) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    // 2. Check if booking is completed (non-negotiable rule)
    if (booking.status !== "completed" && booking.status !== "completed_by_provider") {
      return new NextResponse(
        `You can only review a completed booking (status: ${booking.status}).`,
        { status: 400 }
      );
    }

    // 2b. Prevent duplicate reviews
    const existing = await db.query.reviews.findFirst({
      where: and(eq(reviews.bookingId, booking.id), eq(reviews.userId, userId)),
      columns: { id: true },
    });
    if (existing) {
      return new NextResponse("A review already exists for this booking.", { status: 409 });
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
        comment: sanitizedComment || null,
        serviceId: booking.serviceId,
      })
      .returning();

    // --- Trigger trust score recompute for the provider ---
    try {
      const nextScore = await calculateTrustScore(booking.providerId);
      await db
        .update(providers)
        .set({ trustScore: nextScore })
        .where(eq(providers.id, booking.providerId));
    } catch (trustError) {
      console.error("[API_REVIEW_CREATE] Failed to update trust score", trustError);
    }

    console.log(
      `[API_REVIEW_CREATE] User ${userId} created Review ${newReview.id} for Booking ${booking.id}`
    );

    // --- 4. Notify Provider ---
    try {
      const service = await db.query.services.findFirst({
        where: eq(services.id, booking.serviceId),
        with: { provider: { columns: { handle: true, userId: true } } },
      });

      const providerUserId = service?.provider?.userId;
      if (providerUserId) {
        await createNotification({
          userId: providerUserId,
          message: `You received a ${rating}-star review on ${service?.title ?? "your service"}!`,
          href: `/p/${service?.provider?.handle ?? ""}`,
        });
      }
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

