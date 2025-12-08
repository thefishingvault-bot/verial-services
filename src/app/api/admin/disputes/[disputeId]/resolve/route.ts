import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { disputes, bookings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";
import { DisputeIdSchema, DisputeResolveSchema, invalidResponse, parseForm, parseParams } from "@/lib/validation/admin";

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

    // Resolve the dispute
    await db
      .update(disputes)
      .set({
        status: "resolved",
        adminDecision: parsedForm.data.decision,
        adminNotes: parsedForm.data.adminNotes,
        refundAmount: refundCents,
        resolvedBy: userId!,
        resolvedAt: new Date(),
      })
      .where(eq(disputes.id, parsedParams.data.disputeId));

    // TODO: Here you would integrate with Stripe to process the actual refund
    // if (refundCents && refundCents > 0) {
    //   // Update booking status if needed
    // }

    // Redirect back to the disputes page
    return NextResponse.redirect(new URL("/dashboard/admin/disputes", request.url));
  } catch (error) {
    console.error("Error resolving dispute:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}