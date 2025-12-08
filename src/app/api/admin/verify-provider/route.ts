import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { VerifyProviderSchema, invalidResponse, parseBody } from "@/lib/validation/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;
    const adminUserId = admin.userId!;

    const parsed = await parseBody(VerifyProviderSchema, req);
    if (!parsed.ok) return invalidResponse(parsed.error);

    const { providerId, newStatus } = parsed.data;

    // Update the provider's status
    const [updatedProvider] = await db.update(providers)
      .set({
        status: newStatus,
        isVerified: newStatus === 'approved', // Auto-set isVerified on approval
        updatedAt: new Date(),
      })
      .where(eq(providers.id, providerId))
      .returning();

    if (!updatedProvider) {
      return new NextResponse("Provider not found", { status: 404 });
    }

    console.log(`[API_ADMIN_VERIFY] Admin ${adminUserId} set Provider ${providerId} to ${newStatus}`);
    return NextResponse.json(updatedProvider);

  } catch (error) {
    console.error("[API_ADMIN_VERIFY]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

