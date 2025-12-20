import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { refunds, bookings, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";
import { BookingIdSchema, RefundCreateSchema, RefundQuerySchema, invalidResponse, parseBody, parseParams, parseQuery } from "@/lib/validation/admin";
import { createMarketplaceRefund } from "@/lib/stripe-refunds";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;
    const { userId } = admin;

    const parsedBody = await parseBody(RefundCreateSchema, request);
    if (!parsedBody.ok) return invalidResponse(parsedBody.error);
    const { bookingId, amount: refundAmount, reason, description } = parsedBody.data;

    // Get booking details
    const booking = await db
      .select({
        id: bookings.id,
        priceAtBooking: bookings.priceAtBooking,
        paymentIntentId: bookings.paymentIntentId,
        status: bookings.status,
        providerId: bookings.providerId,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (booking.length === 0) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const bookingData = booking[0];

    // Validate booking can be refunded
    if (!bookingData.paymentIntentId) {
      return NextResponse.json({ error: "Booking has no payment to refund" }, { status: 400 });
    }

    if (bookingData.status !== "paid" && bookingData.status !== "completed") {
      return NextResponse.json({
        error: "Can only refund paid or completed bookings"
      }, { status: 400 });
    }

    // Check if refund amount exceeds booking total
    if (refundAmount > bookingData.priceAtBooking) {
      return NextResponse.json({
        error: "Refund amount cannot exceed booking total"
      }, { status: 400 });
    }

    // Generate refund ID
    const refundId = `refund_${crypto.randomUUID()}`;

    try {
      // Create refund record first
      await db.insert(refunds).values({
        id: refundId,
        bookingId,
        amount: refundAmount,
        reason,
        description,
        status: "processing",
        processedBy: userId,
      });

      // Process refund via Stripe (Connect-aware semantics)
      const stripeResult = await createMarketplaceRefund({
        paymentIntentId: bookingData.paymentIntentId,
        amount: refundAmount,
        reason: "requested_by_customer",
        metadata: {
          bookingId,
          refundId,
          processedBy: userId,
          reason,
          source: "admin_booking_refund",
        },
        idempotencyKey: `admin_refund:${bookingId}:${refundAmount}:${refundId}`,
      });

      // Update refund record with Stripe refund ID and mark as completed
      await db
        .update(refunds)
        .set({
          stripeRefundId: stripeResult.refund.id,
          platformFeeRefunded: stripeResult.refundedPlatformFee ?? 0,
          providerAmountRefunded: stripeResult.refundedProviderAmount ?? 0,
          status: stripeResult.refund.status === "succeeded" ? "completed" : "processing",
          processedAt: stripeResult.refund.status === "succeeded" ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(refunds.id, refundId));

      return NextResponse.json({
        success: true,
        refund: {
          id: refundId,
          stripeRefundId: stripeResult.refund.id,
          amount: refundAmount,
          status: stripeResult.refund.status === "succeeded" ? "completed" : "processing",
        },
      });

    } catch (stripeError: unknown) {
      console.error("Stripe refund error:", stripeError);

      // Update refund status to failed
      await db
        .update(refunds)
        .set({
          status: "failed",
          updatedAt: new Date(),
        })
        .where(eq(refunds.id, refundId));

      const errorMessage = stripeError instanceof Error ? stripeError.message : "Unknown error occurred";

      return NextResponse.json({
        error: "Failed to process refund with payment provider",
        details: errorMessage,
      }, { status: 500 });
    }

  } catch (error) {
    console.error("Error processing refund:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET endpoint to retrieve refunds for a booking
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const parsedQuery = parseQuery(RefundQuerySchema, request);
    if (!parsedQuery.ok) return invalidResponse(parsedQuery.error);

    const bookingRefunds = await db
      .select({
        id: refunds.id,
        amount: refunds.amount,
        reason: refunds.reason,
        description: refunds.description,
        platformFeeRefunded: refunds.platformFeeRefunded,
        providerAmountRefunded: refunds.providerAmountRefunded,
        status: refunds.status,
        stripeRefundId: refunds.stripeRefundId,
        processedAt: refunds.processedAt,
        createdAt: refunds.createdAt,
        processorFirstName: users.firstName,
        processorLastName: users.lastName,
      })
      .from(refunds)
      .innerJoin(users, eq(refunds.processedBy, users.id))
      .where(eq(refunds.bookingId, parsedQuery.data.bookingId))
      .orderBy(refunds.createdAt);

    return NextResponse.json({ refunds: bookingRefunds });

  } catch (error) {
    console.error("Error fetching refunds:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}