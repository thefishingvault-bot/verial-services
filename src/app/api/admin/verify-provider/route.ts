import { db } from "@/lib/db";
import { providers, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
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

    // Grant or revoke provider dashboard access based on approval status.
    // Only approved providers should have role === 'provider'.
    const nextRole = newStatus === "approved" ? "provider" : "user";

    // Update DB user role (do not downgrade admins, if any exist).
    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, updatedProvider.userId),
      columns: { role: true },
    });

    if (dbUser?.role !== "admin") {
      await db
        .update(users)
        .set({ role: nextRole, providerId })
        .where(eq(users.id, updatedProvider.userId));
    }

    // Update Clerk publicMetadata role (also avoid downgrading admins).
    try {
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(updatedProvider.userId);
      const currentRole = (clerkUser.publicMetadata as Record<string, unknown>)?.role as string | undefined;
      if (currentRole !== "admin") {
        await client.users.updateUserMetadata(updatedProvider.userId, {
          publicMetadata: {
            ...(clerkUser.publicMetadata as Record<string, unknown>),
            role: nextRole,
          },
        });
      }
    } catch (e) {
      // Clerk metadata sync failure should not block approval; middleware can fallback to DB.
      console.warn("[API_ADMIN_VERIFY] Clerk role sync failed", e);
    }

    console.log(`[API_ADMIN_VERIFY] Admin ${adminUserId} set Provider ${providerId} to ${newStatus}`);
    return NextResponse.json(updatedProvider);

  } catch (error) {
    console.error("[API_ADMIN_VERIFY]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

