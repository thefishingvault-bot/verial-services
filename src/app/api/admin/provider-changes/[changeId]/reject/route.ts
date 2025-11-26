import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { providerChanges } from "@/db/schema";
import { eq } from "drizzle-orm";

// TODO: Replace with actual role check utility if needed
type ClerkUser = { publicMetadata?: { role?: string } };
function isAdmin(user: ClerkUser | null | undefined): boolean {
  return user?.publicMetadata?.role === "admin";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ changeId: string }> }
) {
  try {
    const user = await currentUser();
    if (!isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { changeId } = await params;

    // Get the change
    const change = await db
      .select()
      .from(providerChanges)
      .where(eq(providerChanges.id, changeId))
      .limit(1);

    if (change.length === 0) {
      return NextResponse.json({ error: "Change not found" }, { status: 404 });
    }

    const changeRecord = change[0];

    if (changeRecord.status !== "pending") {
      return NextResponse.json({ error: "Change already processed" }, { status: 400 });
    }

    // Update the change status to rejected
    await db
      .update(providerChanges)
      .set({
        status: "rejected",
        reviewedBy: user!.id,
        updatedAt: new Date(),
      })
      .where(eq(providerChanges.id, changeId));

    // Redirect back to the changes page
    return NextResponse.redirect(new URL("/dashboard/admin/providers/changes", request.url));
  } catch (error) {
    console.error("Error rejecting provider change:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
