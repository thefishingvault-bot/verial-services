import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";

import { bookingReschedules, bookings, providers } from "@/db/schema";
import { db } from "@/lib/db";
import { createNotificationOnce } from "@/lib/notifications";
import { isRescheduleEligible, validateRescheduleProposal } from "@/lib/reschedule";
import { bookingIdempotencyKey, withIdempotency } from "@/lib/idempotency";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

type Action = "approve" | "decline";

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
    resource: "bookings:reschedule-respond",
    limit: 5,
    windowSeconds: 60,
  });

  if (!rate.success) {
    return rateLimitResponse(rate.retryAfter);
  }

  const body = await req.json().catch(() => null) as { action?: Action; note?: string; rescheduleId?: string } | null;
  const action = body?.action;
  const note = typeof body?.note === "string" ? body.note.trim() : null;
  const rescheduleId = body?.rescheduleId;

  if (action !== "approve" && action !== "decline") {
    return new NextResponse("Invalid action", { status: 400 });
  }

  const idemKey = bookingIdempotencyKey("reschedule-respond", userId, bookingId, { action, rescheduleId });

  try {
    const result = await withIdempotency(idemKey, 6 * 60 * 60, async () => {
      const provider = await db.query.providers.findFirst({ where: eq(providers.userId, userId) });
      if (!provider) throw new Error("PROVIDER_NOT_FOUND");

      const booking = await db.query.bookings.findFirst({
        where: and(eq(bookings.id, bookingId), eq(bookings.providerId, provider.id)),
        with: { user: { columns: { id: true } }, service: { columns: { title: true } } },
      });

      if (!booking) throw new Error("NOT_FOUND");

      if (!isRescheduleEligible(booking.status)) {
        throw new Error("INVALID_STATE");
      }

      let where = and(eq(bookingReschedules.bookingId, bookingId), eq(bookingReschedules.status, "pending"));
      if (rescheduleId) {
        where = and(where, eq(bookingReschedules.id, rescheduleId));
      }

      const pendingReschedule = await db.query.bookingReschedules.findFirst({
        where,
        orderBy: [desc(bookingReschedules.createdAt)],
      });

      if (!pendingReschedule) {
        throw new Error("NO_PENDING");
      }

      const now = new Date();

      if (action === "approve") {
        if (pendingReschedule.proposedDate < new Date()) {
          throw new Error("Proposed time is in the past");
        }

        const validation = await validateRescheduleProposal({
          bookingId,
          providerId: provider.id,
          proposedDate: new Date(pendingReschedule.proposedDate),
        });

        if (!validation.ok) {
          throw new Error(validation.reason);
        }

        await db.transaction(async (tx) => {
          await tx
            .update(bookingReschedules)
            .set({ status: "approved", responderId: userId, providerNote: note, updatedAt: now })
            .where(eq(bookingReschedules.id, pendingReschedule.id));

          await tx
            .update(bookings)
            .set({ scheduledDate: pendingReschedule.proposedDate, updatedAt: now })
            .where(eq(bookings.id, bookingId));
        });

        if (booking.user?.id) {
          await createNotificationOnce({
            event: "reschedule_approved",
            bookingId,
            userId: booking.user.id,
            payload: {
              title: "Reschedule approved",
              body: note || `Your booking was rescheduled${booking.service?.title ? ` for ${booking.service.title}` : ""}.`,
              actionUrl: `/dashboard/bookings/${bookingId}`,
              bookingId,
              providerId: provider.id,
            },
          });
        }

        return { id: pendingReschedule.id, status: "approved", scheduledDate: pendingReschedule.proposedDate };
      }

      await db
        .update(bookingReschedules)
        .set({ status: "declined", responderId: userId, providerNote: note, updatedAt: now })
        .where(eq(bookingReschedules.id, pendingReschedule.id));

      if (booking.user?.id) {
        await createNotificationOnce({
          event: "reschedule_declined",
          bookingId,
          userId: booking.user.id,
          payload: {
            title: "Reschedule declined",
            body: note || "Your provider declined the reschedule request.",
            actionUrl: `/dashboard/bookings/${bookingId}`,
            bookingId,
            providerId: provider.id,
          },
        });
      }

      return { id: pendingReschedule.id, status: "declined" };
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";

    if (message === "PROVIDER_NOT_FOUND") return new NextResponse("Provider not found", { status: 404 });
    if (message === "NOT_FOUND") return new NextResponse("Booking not found", { status: 404 });
    if (message === "INVALID_STATE") {
      return new NextResponse("Booking cannot be rescheduled in its current state", { status: 400 });
    }
    if (message === "NO_PENDING") return new NextResponse("No pending reschedule request found", { status: 404 });
    if (message === "Proposed time is in the past") {
      return new NextResponse(message, { status: 400 });
    }
    if (message) {
      return new NextResponse(message, { status: 400 });
    }

    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
