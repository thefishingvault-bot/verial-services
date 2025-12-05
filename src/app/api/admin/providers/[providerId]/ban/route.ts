import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { providers, providerSuspensions } from "@/db/schema";
import { eq } from "drizzle-orm";

const isAdmin = async (userId: string): Promise<boolean> => {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return user.publicMetadata.role === "admin";
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId || !(await isAdmin(userId))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { providerId } = await params;
    const { reason } = (await req.json().catch(() => ({}))) as { reason?: string };

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

    const now = new Date();
    const suspensionReason = reason?.trim() || "Banned by admin";

    const [updated] = await db
      .update(providers)
      .set({
        isSuspended: true,
        suspensionReason,
        suspensionStartDate: now,
        suspensionEndDate: null,
        updatedAt: now,
      })
      .where(eq(providers.id, providerId))
      .returning();

    await db.insert(providerSuspensions).values({
      id: `psusp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      providerId,
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