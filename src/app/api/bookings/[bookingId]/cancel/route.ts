import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";

import { db } from "@/lib/db";
import { bookings, bookingCancellations, refunds } from "@/db/schema";
import { assertTransition } from "@/lib/booking-state";
import { createNotificationOnce } from "@/lib/notifications";
import { bookingIdempotencyKey, withIdempotency } from "@/lib/idempotency";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { createMarketplaceRefund } from "@/lib/stripe-refunds";
import { asOne } from "@/lib/relations/normalize";

export const runtime = "nodejs";

const cancellableStatuses = ["pending", "accepted", "paid"] as const;

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
    resource: "bookings:cancel",
    limit: 5,
    windowSeconds: 60,
  });

  if (!rate.success) {
    return rateLimitResponse(rate.retryAfter);
  }

  const body = await req.json().catch(() => ({} as { reason?: string | null }));
  const reason = typeof body?.reason === "string" ? body.reason.trim() : null;
  const idemKey = bookingIdempotencyKey("cancel", userId, bookingId);

  try {
    const result = await withIdempotency(idemKey, 6 * 60 * 60, async () => {
      const booking = await db.query.bookings.findFirst({
        where: eq(bookings.id, bookingId),
        with: {
          provider: { columns: { id: true, userId: true, businessName: true } },
          user: { columns: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      if (!booking) throw new Error("NOT_FOUND");

      const provider = asOne(booking.provider);
      const providerUserId = provider?.userId;
      const providerId = provider?.id;

      const actor = booking.userId === userId
        ? "customer"
        : providerUserId === userId
        ? "provider"
        : null;

      if (!actor) throw new Error("FORBIDDEN");

      if (!cancellableStatuses.includes(booking.status as (typeof cancellableStatuses)[number])) {
        throw new Error("INVALID_STATE");
      }

      const nextStatus = actor === "customer" ? "canceled_customer" : "canceled_provider";

      try {
        assertTransition(booking.status, nextStatus);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid status transition";
        throw new Error(message);
      }

      if (booking.status === "paid" && actor === "provider" && booking.scheduledDate) {
        if (booking.scheduledDate < new Date()) {
          throw new Error("Providers cannot cancel after the scheduled start time");
        }
      }

      let refund: Stripe.Response<Stripe.Refund> | null = null;
      let refundRecordId: string | null = null;
      if (booking.status === "paid") {
        if (!booking.paymentIntentId) {
          throw new Error("REFUND_FAILED");
        }

        refundRecordId = `refund_${crypto.randomUUID()}`;

        // Record refund intent first for auditability.
        await db.insert(refunds).values({
          id: refundRecordId,
          bookingId,
          amount: booking.priceAtBooking,
          reason: "booking_cancellation",
          description: actor === "customer" ? "Cancelled by customer" : "Cancelled by provider",
          status: "processing",
          processedBy: userId,
        });

        try {
          const result = await createMarketplaceRefund({
            paymentIntentId: booking.paymentIntentId,
            amount: booking.priceAtBooking,
            reason: "requested_by_customer",
            metadata: {
              bookingId,
              refundId: refundRecordId,
              processedBy: userId,
              actor,
              source: "booking_cancel",
            },
            idempotencyKey: `${idemKey}:refund`,
          });

          refund = result.refund;

          await db
            .update(refunds)
            .set({
              stripeRefundId: result.refund.id,
              platformFeeRefunded: result.refundedPlatformFee ?? 0,
              providerAmountRefunded: result.refundedProviderAmount ?? 0,
              status: result.refund.status === "succeeded" ? "completed" : "processing",
              processedAt: result.refund.status === "succeeded" ? new Date() : null,
              updatedAt: new Date(),
            })
            .where(eq(refunds.id, refundRecordId));
        } catch (error) {
          console.error("[BOOKING_CANCEL_REFUND_ERROR]", error);
          if (refundRecordId) {
            await db
              .update(refunds)
              .set({ status: "failed", updatedAt: new Date() })
              .where(eq(refunds.id, refundRecordId));
          }
          throw new Error("REFUND_FAILED");
        }
      }

      const cancellationId = `bc_${crypto.randomUUID()}`;
      const now = new Date();

      // Neon HTTP driver doesn't support transactions. Do sequential writes.
      await db
        .update(bookings)
        .set({ status: nextStatus, updatedAt: now })
        .where(eq(bookings.id, bookingId));

      await db.insert(bookingCancellations).values({
        id: cancellationId,
        bookingId,
        userId,
        actor,
        reason,
        createdAt: now,
      });

      const bookingUrl = `/dashboard/bookings/${bookingId}`;

      if (actor === "customer" && providerUserId) {
        await createNotificationOnce({
          event: "booking_cancelled_customer",
          bookingId,
          userId: providerUserId,
          payload: {
            title: "Booking cancelled by customer",
            body: reason ? `Reason: ${reason}` : "A customer cancelled a booking.",
            actionUrl: bookingUrl,
            bookingId,
            providerId,
          },
        });
      }

      if (actor === "provider") {
        await createNotificationOnce({
          event: "booking_cancelled_provider",
          bookingId,
          userId: booking.userId,
          payload: {
            title: "Booking cancelled by provider",
            body: reason ? `Reason: ${reason}` : "Your provider cancelled this booking.",
            actionUrl: bookingUrl,
            bookingId,
            providerId,
          },
        });
      }

      if (refund) {
        const refundMessage = `Refund initiated (${refund.status}).`;
        if (booking.userId) {
          await createNotificationOnce({
            event: "refund_processed",
            bookingId,
            userId: booking.userId,
            payload: {
              title: "Refund processed",
              body: refundMessage,
              actionUrl: bookingUrl,
              bookingId,
            },
          });
        }
        if (providerUserId) {
          await createNotificationOnce({
            event: "booking_refunded",
            bookingId,
            userId: providerUserId,
            payload: {
              title: "Booking refunded",
              body: refundMessage,
              actionUrl: bookingUrl,
              bookingId,
              providerId,
            },
          });
        }
      }

      return {
        bookingId,
        status: nextStatus,
        cancellationId,
        refunded: !!refund,
        refundId: refund?.id ?? null,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";

    if (message === "NOT_FOUND") return new NextResponse("Booking not found", { status: 404 });
    if (message === "FORBIDDEN") return new NextResponse("Unauthorized", { status: 403 });
    if (message === "INVALID_STATE") {
      return new NextResponse("Booking cannot be cancelled in its current state", { status: 400 });
    }
    if (message === "REFUND_FAILED") return new NextResponse("Failed to refund payment", { status: 502 });
    if (message === "Invalid status transition") return new NextResponse(message, { status: 400 });
    if (message === "Providers cannot cancel after the scheduled start time") {
      return new NextResponse(message, { status: 400 });
    }

    console.error("[BOOKING_CANCEL]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
