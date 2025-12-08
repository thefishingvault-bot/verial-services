import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers, providerSuspensions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;
    const { userId } = admin;

    const { providerId } = await params;

    // Check if provider exists and is suspended
    const provider = await db
      .select()
      .from(providers)
      .where(eq(providers.id, providerId))
      .limit(1);

    if (provider.length === 0) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    if (!provider[0].isSuspended) {
      return NextResponse.json({ error: "Provider is not suspended" }, { status: 400 });
    }

    // Update provider to unsuspended
    await db
      .update(providers)
      .set({
        isSuspended: false,
        suspensionReason: null,
        suspensionStartDate: null,
        suspensionEndDate: null,
        updatedAt: new Date(),
      })
      .where(eq(providers.id, providerId));

    // Log the action
    await db.insert(providerSuspensions).values({
      id: `psusp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      providerId,
      action: "unsuspend",
      performedBy: userId!,
    });

    // Redirect back to the suspensions page
    return NextResponse.redirect(new URL("/dashboard/admin/providers/suspension", request.url));
  } catch (error) {
    console.error("Error unsuspending provider:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}