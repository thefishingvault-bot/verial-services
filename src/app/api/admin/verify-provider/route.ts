import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Helper function to check for Admin role
const isAdmin = async (userId: string): Promise<boolean> => {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return user.publicMetadata.role === "admin";
};

export async function POST(req: Request) {
  try {
    const { userId: adminUserId } = await auth();
    if (!adminUserId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!(await isAdmin(adminUserId))) {
      return new NextResponse("Forbidden: Requires admin role", { status: 403 });
    }

    const { providerId, newStatus } = await req.json();

    if (!providerId || !newStatus) {
      return new NextResponse("Missing providerId or newStatus", { status: 400 });
    }

    // Validate the new status
    const validStatuses = ["pending", "approved", "rejected"];
    if (!validStatuses.includes(newStatus)) {
      return new NextResponse(`Invalid status: ${newStatus}`, { status: 400 });
    }

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

