import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { providers, providerSuspensions } from "@/db/schema";
import { eq } from "drizzle-orm";

// TODO: Replace with actual role check utility if needed
type ClerkUser = { publicMetadata?: { role?: string } };
function isAdmin(user: ClerkUser | null | undefined): boolean {
  return user?.publicMetadata?.role === "admin";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const user = await currentUser();
    if (!isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { providerId } = await params;

    // Parse form data
    const formData = await request.formData();
    const reason = formData.get("reason") as string;
    const startDate = formData.get("startDate") as string;
    const endDate = formData.get("endDate") as string;

    if (!reason || !startDate) {
      return NextResponse.json({ error: "Reason and start date are required" }, { status: 400 });
    }

    // Check if provider exists and is not already suspended
    const provider = await db
      .select()
      .from(providers)
      .where(eq(providers.id, providerId))
      .limit(1);

    if (provider.length === 0) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    if (provider[0].isSuspended) {
      return NextResponse.json({ error: "Provider is already suspended" }, { status: 400 });
    }

    // Update provider to suspended
    await db
      .update(providers)
      .set({
        isSuspended: true,
        suspensionReason: reason,
        suspensionStartDate: new Date(startDate),
        suspensionEndDate: endDate ? new Date(endDate) : null,
        updatedAt: new Date(),
      })
      .where(eq(providers.id, providerId));

    // Log the action
    await db.insert(providerSuspensions).values({
      id: `psusp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      providerId,
      action: "suspend",
      reason,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      performedBy: user!.id,
    });

    // Redirect back to the suspensions page
    return NextResponse.redirect(new URL("/dashboard/admin/providers/suspension", request.url));
  } catch (error) {
    console.error("Error suspending provider:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}