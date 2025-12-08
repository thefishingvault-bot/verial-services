import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { providers, providerSuspensions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";
import { ProviderBanSchema, ProviderIdSchema, invalidResponse, parseBody, parseParams } from "@/lib/validation/admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;
    const userId = admin.userId!;

    const parsedParams = parseParams(ProviderIdSchema, await params);
    if (!parsedParams.ok) return invalidResponse(parsedParams.error);

    const parsedBody = await parseBody(ProviderBanSchema, req);
    if (!parsedBody.ok) return invalidResponse(parsedBody.error);

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

    const now = new Date();
    const suspensionReason = parsedBody.data.reason;

    const [updated] = await db
      .update(providers)
      .set({
        isSuspended: true,
        suspensionReason,
        suspensionStartDate: now,
        suspensionEndDate: null,
        updatedAt: now,
      })
      .where(eq(providers.id, parsedParams.data.providerId))
      .returning();

    await db.insert(providerSuspensions).values({
      id: `psusp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      providerId: parsedParams.data.providerId,
      action: "suspend",
      reason: suspensionReason,
      startDate: now,
      endDate: null,
      performedBy: userId,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[ADMIN_BAN_PROVIDER]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}