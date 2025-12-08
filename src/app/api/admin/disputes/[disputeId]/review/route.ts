import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { disputes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";
import { DisputeIdSchema, invalidResponse, parseParams } from "@/lib/validation/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ disputeId: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const parsedParams = parseParams(DisputeIdSchema, await params);
    if (!parsedParams.ok) return invalidResponse(parsedParams.error);

    // Check if dispute exists and is open
    const dispute = await db
      .select()
      .from(disputes)
      .where(eq(disputes.id, parsedParams.data.disputeId))
      .limit(1);

    if (dispute.length === 0) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }

    if (dispute[0].status !== "open") {
      return NextResponse.json({ error: "Dispute is not in open status" }, { status: 400 });
    }

    // Update dispute to under review
    await db
      .update(disputes)
      .set({
        status: "under_review",
        updatedAt: new Date(),
      })
      .where(eq(disputes.id, parsedParams.data.disputeId));

    // Redirect back to the disputes page
    return NextResponse.redirect(new URL("/dashboard/admin/disputes", request.url));
  } catch (error) {
    console.error("Error setting dispute to review:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}