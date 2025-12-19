import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers, providerSuspensions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";
import { ProviderIdSchema, ProviderSuspensionSchema, invalidResponse, parseForm, parseParams } from "@/lib/validation/admin";
import { ensureUserExistsInDb } from "@/lib/user-sync";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;
    const { userId } = admin;

    await ensureUserExistsInDb(userId!, "admin");

    const parsedParams = parseParams(ProviderIdSchema, await params);
    if (!parsedParams.ok) return invalidResponse(parsedParams.error);

    const parsedForm = await parseForm(ProviderSuspensionSchema, request);
    if (!parsedForm.ok) return invalidResponse(parsedForm.error);

    // Check if provider exists and is not already suspended
    const provider = await db
      .select()
      .from(providers)
      .where(eq(providers.id, parsedParams.data.providerId))
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
        suspensionReason: parsedForm.data.reason,
        suspensionStartDate: parsedForm.data.startDate,
        suspensionEndDate: parsedForm.data.endDate,
        updatedAt: new Date(),
      })
      .where(eq(providers.id, parsedParams.data.providerId));

    // Log the action
    await db.insert(providerSuspensions).values({
      id: `psusp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      providerId: parsedParams.data.providerId,
      action: "suspend",
      reason: parsedForm.data.reason,
      startDate: parsedForm.data.startDate,
      endDate: parsedForm.data.endDate,
      performedBy: userId!,
    });

    // Redirect back to the suspensions page
    return NextResponse.redirect(new URL("/dashboard/admin/providers/suspension", request.url));
  } catch (error) {
    console.error("Error suspending provider:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}