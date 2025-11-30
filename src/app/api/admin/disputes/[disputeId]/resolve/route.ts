import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { disputes, bookings } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ disputeId: string }> }
) {
  try {
    const user = await currentUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await requireAdmin(user.id);

    const { disputeId } = await params;

    // Parse form data
    const formData = await request.formData();
    const decision = formData.get("decision") as string;
    const refundAmount = formData.get("refundAmount") as string;
    const adminNotes = formData.get("adminNotes") as string;

    if (!decision || !adminNotes) {
      return NextResponse.json({ error: "Decision and admin notes are required" }, { status: 400 });
    }

    // Check if dispute exists and is under review
    const dispute = await db
      .select({
        id: disputes.id,
        bookingId: disputes.bookingId,
        status: disputes.status,
      })
      .from(disputes)
      .where(eq(disputes.id, disputeId))
      .limit(1);

    if (dispute.length === 0) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }

    if (dispute[0].status !== "under_review") {
      return NextResponse.json({ error: "Dispute is not under review" }, { status: 400 });
    }

    // Validate refund amount if provided
    const refundCents = refundAmount ? parseInt(refundAmount) : null;
    if (refundAmount && (isNaN(refundCents!) || refundCents! < 0)) {
      return NextResponse.json({ error: "Invalid refund amount" }, { status: 400 });
    }

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
        adminDecision: decision,
        adminNotes,
        refundAmount: refundCents,
        resolvedBy: user!.id,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(disputes.id, disputeId));

    // TODO: Here you would integrate with Stripe to process the actual refund
    // if (refundCents && refundCents > 0) {
    //   // Process refund via Stripe API
    //   // Update booking status if needed
    // }

    // Redirect back to the disputes page
    return NextResponse.redirect(new URL("/dashboard/admin/disputes", request.url));
  } catch (error) {
    console.error("Error resolving dispute:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}