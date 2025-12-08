import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";
import { ProviderIdSchema, ProviderVerificationSchema, invalidResponse, parseBody, parseParams } from "@/lib/validation/admin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const parsedParams = parseParams(ProviderIdSchema, await params);
    if (!parsedParams.ok) return invalidResponse(parsedParams.error);

    const parsedBody = await parseBody(ProviderVerificationSchema, req);
    if (!parsedBody.ok) return invalidResponse(parsedBody.error);

    const [updated] = await db
      .update(providers)
      .set({ isVerified: parsedBody.data.isVerified, updatedAt: new Date() })
      .where(eq(providers.id, parsedParams.data.providerId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[ADMIN_SET_VERIFIED]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}