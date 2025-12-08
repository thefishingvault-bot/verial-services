import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providerChanges, providers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ changeId: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;
    const { userId } = admin;

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

    // Apply the change to the provider
    const updateData: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    updateData[changeRecord.fieldName] = changeRecord.newValue;

    await db
      .update(providers)
      .set(updateData)
      .where(eq(providers.id, changeRecord.providerId));

    // Update the change status
    await db
      .update(providerChanges)
      .set({
        status: "approved",
        reviewedBy: userId!,
        updatedAt: new Date(),
      })
      .where(eq(providerChanges.id, changeId));

    // Redirect back to the changes page
    return NextResponse.redirect(new URL("/dashboard/admin/providers/changes", request.url));
  } catch (error) {
    console.error("Error approving provider change:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
