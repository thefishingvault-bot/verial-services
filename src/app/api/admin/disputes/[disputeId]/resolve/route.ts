import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { disputes, bookings, refunds } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";
import { DisputeIdSchema, DisputeResolveSchema, invalidResponse, parseForm, parseParams } from "@/lib/validation/admin";
import { createMarketplaceRefund } from "@/lib/stripe-refunds";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ disputeId: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;
    const { userId } = admin;

    const parsedParams = parseParams(DisputeIdSchema, await params);
    if (!parsedParams.ok) return invalidResponse(parsedParams.error);

    const parsedForm = await parseForm(DisputeResolveSchema, request);
    if (!parsedForm.ok) return invalidResponse(parsedForm.error);

    // Check if dispute exists and is under review
    const dispute = await db
      .select({
        id: disputes.id,
        bookingId: disputes.bookingId,
        status: disputes.status,
      })
      .from(disputes)
      .where(eq(disputes.id, parsedParams.data.disputeId))
      .limit(1);

    if (dispute.length === 0) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }


    if (dispute[0].status !== "under_review") {
      return NextResponse.json({ error: "Dispute is not under review" }, { status: 400 });
    }

    // Validate refund amount if provided
    const refundCents = parsedForm.data.refundAmount;
    // Get booking details for validation
    const booking = await db
      .select({
        priceAtBooking: bookings.priceAtBooking,
        paymentIntentId: bookings.paymentIntentId,
      })
      .from(bookings)
      .where(eq(bookings.id, dispute[0].bookingId))
      .limit(1);

    if (booking.length === 0) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    // Validate refund doesn't exceed booking amount
    if (refundCents && refundCents > booking[0].priceAtBooking) {
      return NextResponse.json({ error: "Refund amount cannot exceed booking total" }, { status: 400 });
    }

    // If a refund is part of the resolution, execute it in Stripe and record it.
    if (refundCents && refundCents > 0) {
      const paymentIntentId = booking[0].paymentIntentId;
      if (!paymentIntentId) {
        return NextResponse.json({ error: "Booking has no payment to refund" }, { status: 400 });
      }

      const refundId = `refund_${crypto.randomUUID()}`;

      await db.insert(refunds).values({
        id: refundId,
        bookingId: dispute[0].bookingId,
        amount: refundCents,
        reason: "dispute_resolution",
        description: parsedForm.data.adminNotes ?? null,
        status: "processing",
        processedBy: userId!,
      });

      try {
        const result = await createMarketplaceRefund({
          paymentIntentId,
          amount: refundCents,
          reason: "requested_by_customer",
          metadata: {
            bookingId: dispute[0].bookingId,
            disputeId: parsedParams.data.disputeId,
            refundId,
            processedBy: userId!,
            source: "admin_dispute_resolve",
          },
          idempotencyKey: `dispute:${parsedParams.data.disputeId}:refund:${refundCents}`,
        });

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
          .where(eq(refunds.id, refundId));
      } catch (stripeError: unknown) {
        const message = stripeError instanceof Error ? stripeError.message : "Unknown error";
        console.error("[ADMIN_DISPUTE_REFUND_ERROR]", stripeError);
        await db
          .update(refunds)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(refunds.id, refundId));
        return NextResponse.json(
          { error: "Failed to process refund with payment provider", details: message },
          { status: 502 },
        );
      }
    }

    // Resolve the dispute (do not mark booking refunded here; webhooks handle that after Stripe confirms)
    await db
      .update(disputes)
      .set({
        status: "resolved",
        adminDecision: parsedForm.data.decision,
        adminNotes: parsedForm.data.adminNotes,
        refundAmount: refundCents,
        resolvedBy: userId!,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(disputes.id, parsedParams.data.disputeId));

    // Redirect back to the disputes page
    return NextResponse.redirect(new URL("/dashboard/admin/disputes", request.url));
  } catch (error) {
    console.error("Error resolving dispute:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}