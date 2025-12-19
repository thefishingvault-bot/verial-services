import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers, providerSuspensions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";
import { ProviderIdSchema, invalidResponse, parseParams } from "@/lib/validation/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;
    const { userId } = admin;

    const parsedParams = parseParams(ProviderIdSchema, await params);
    if (!parsedParams.ok) return invalidResponse(parsedParams.error);
    const { providerId } = parsedParams.data;

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

    const priorSuspension = {
      reason: provider[0].suspensionReason,
      startDate: provider[0].suspensionStartDate,
      endDate: provider[0].suspensionEndDate,
    };

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
      reason: priorSuspension.reason,
      startDate: priorSuspension.startDate,
      endDate: priorSuspension.endDate,
    });

    // Redirect back to the suspensions page
    return NextResponse.redirect(new URL("/dashboard/admin/providers/suspension", request.url));
  } catch (error) {
    console.error("Error unsuspending provider:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}