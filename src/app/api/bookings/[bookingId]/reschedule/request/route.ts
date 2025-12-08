import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";

import { bookingReschedules, bookings } from "@/db/schema";
import { db } from "@/lib/db";
import { createNotificationOnce } from "@/lib/notifications";
import { validateRescheduleProposal, isRescheduleEligible } from "@/lib/reschedule";
import { bookingIdempotencyKey, withIdempotency } from "@/lib/idempotency";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const { bookingId } = await params;
  if (!bookingId) return new NextResponse("Missing bookingId", { status: 400 });

  const rate = await enforceRateLimit(req, {
    userId,
    resource: "bookings:reschedule-request",
    limit: 5,
    windowSeconds: 60,
  });

  if (!rate.success) {
    return rateLimitResponse(rate.retryAfter);
  }

  const body = await req.json().catch(() => null) as { proposedDate?: string; note?: string } | null;
  const proposedDateInput = body?.proposedDate;
  const note = typeof body?.note === "string" ? body.note.trim() : null;

  if (!proposedDateInput) return new NextResponse("Missing proposedDate", { status: 400 });

  const proposedDate = new Date(proposedDateInput);
  if (Number.isNaN(proposedDate.getTime())) {
    return new NextResponse("Invalid proposedDate", { status: 400 });
  }

  if (proposedDate < new Date()) {
    return new NextResponse("Proposed date must be in the future", { status: 400 });
  }

  const idemKey = bookingIdempotencyKey("reschedule-request", userId, bookingId, { proposedDate, note });

  try {
    const result = await withIdempotency(idemKey, 6 * 60 * 60, async () => {
      const booking = await db.query.bookings.findFirst({
        where: eq(bookings.id, bookingId),
        with: {
          provider: { columns: { id: true, userId: true, businessName: true } },
          user: { columns: { id: true, firstName: true, lastName: true, email: true } },
          service: { columns: { title: true } },
        },
      });

      if (!booking) throw new Error("NOT_FOUND");

      const viewerIsCustomer = booking.userId === userId;
      if (!viewerIsCustomer) throw new Error("FORBIDDEN");

      if (!isRescheduleEligible(booking.status)) {
        throw new Error("INVALID_STATE");
      }

      const existingPending = await db.query.bookingReschedules.findFirst({
        where: and(eq(bookingReschedules.bookingId, bookingId), eq(bookingReschedules.status, "pending")),
        orderBy: [desc(bookingReschedules.createdAt)],
      });

      if (existingPending) {
        throw new Error("PENDING_EXISTS");
      }

      const validation = await validateRescheduleProposal({
        bookingId,
        providerId: booking.providerId,
        proposedDate,
      });

      if (!validation.ok) {
        throw new Error(validation.reason);
      }

      const rescheduleId = `br_${crypto.randomUUID()}`;
      const now = new Date();

      await db.insert(bookingReschedules).values({
        id: rescheduleId,
        bookingId,
        requesterId: userId,
        proposedDate,
        status: "pending",
        customerNote: note,
        createdAt: now,
        updatedAt: now,
      });

      if (booking.provider?.userId) {
        await createNotificationOnce({
          event: "reschedule_requested",
          bookingId,
          userId: booking.provider.userId,
          payload: {
            title: "New reschedule request",
            body: `A customer requested to move this booking${booking.service?.title ? ` for ${booking.service.title}` : ""}.`,
            actionUrl: `/dashboard/bookings/${bookingId}`,
            bookingId,
            providerId: booking.provider.id,
          },
        });
      }

      return { id: rescheduleId, status: "pending", proposedDate };
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";

    if (message === "NOT_FOUND") return new NextResponse("Booking not found", { status: 404 });
    if (message === "FORBIDDEN") return new NextResponse("Unauthorized", { status: 403 });
    if (message === "INVALID_STATE") {
      return new NextResponse("Booking cannot be rescheduled in its current state", { status: 400 });
    }
    if (message === "PENDING_EXISTS") {
      return new NextResponse("A reschedule request is already pending", { status: 409 });
    }
    if (message) {
      return new NextResponse(message, { status: 400 });
    }

    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
