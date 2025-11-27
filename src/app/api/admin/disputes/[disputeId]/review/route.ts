import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { disputes } from "@/db/schema";
import { eq } from "drizzle-orm";

// TODO: Replace with actual role check utility if needed
type ClerkUser = { publicMetadata?: { role?: string } };
function isAdmin(user: ClerkUser | null | undefined): boolean {
  return user?.publicMetadata?.role === "admin";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ disputeId: string }> }
) {
  try {
    const user = await currentUser();
    if (!isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { disputeId } = await params;

    // Check if dispute exists and is open
    const dispute = await db
      .select()
      .from(disputes)
      .where(eq(disputes.id, disputeId))
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
      .where(eq(disputes.id, disputeId));

    // Redirect back to the disputes page
    return NextResponse.redirect(new URL("/dashboard/admin/disputes", request.url));
  } catch (error) {
    console.error("Error setting dispute to review:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}