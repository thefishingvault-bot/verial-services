import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { eq } from "drizzle-orm";

const isAdmin = async (userId: string): Promise<boolean> => {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return user.publicMetadata.role === "admin";
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId || !(await isAdmin(userId))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { providerId } = await params;
    const body = (await req.json().catch(() => ({}))) as { isVerified?: boolean };

    if (typeof body.isVerified !== "boolean") {
      return NextResponse.json({ error: "isVerified boolean is required" }, { status: 400 });
    }

    const [updated] = await db
      .update(providers)
      .set({ isVerified: body.isVerified, updatedAt: new Date() })
      .where(eq(providers.id, providerId))
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