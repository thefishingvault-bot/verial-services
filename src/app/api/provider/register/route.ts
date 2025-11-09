import { db } from "@/lib/db";
import { providers, users } from "@/db/schema";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

// Helper function to create a unique ID
const generateProviderId = () => `prov_${new Date().getTime()}_${Math.random().toString(36).substring(2, 9)}`;

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Check if user is already a provider
    const existingProvider = await db.query.providers.findFirst({
      where: (p, { eq }) => eq(p.userId, userId),
    });
    if (existingProvider) {
      return new NextResponse("User is already a provider", { status: 400 });
    }

    const { businessName, handle } = await req.json();
    if (!businessName || !handle) {
      return new NextResponse("Missing businessName or handle", { status: 400 });
    }

    // --- 1. Create the new Provider record ---
    const newProviderId = generateProviderId();
    const [newProvider] = await db.insert(providers).values({
      id: newProviderId,
      userId: userId,
      businessName: businessName,
      handle: handle,
      // All other fields (status, trust, etc.) will use their defaults
    }).returning();

    // --- 2. Update the User record to link to the providerId ---
    await db.update(users)
      .set({ providerId: newProvider.id, role: "provider" })
      .where(eq(users.id, userId));

    // --- 3. Update Clerk publicMetadata to set role ---
    const client = await clerkClient();
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        role: "provider",
      },
    });

    console.log(`[API_PROVIDER_REGISTER] User ${userId} successfully registered as Provider ${newProvider.id}`);
    return NextResponse.json(newProvider);

  } catch (error: any) {
    // Check for unique constraint violation on 'handle'
    if (error.code === '23505' && error.constraint?.includes('handle')) {
      const handleMatch = error.detail?.match(/\((.*?)\)/);
      const handleValue = handleMatch ? handleMatch[1] : 'this handle';
      return new NextResponse(`Handle '${handleValue}' is already taken.`, { status: 409 });
    }
    console.error("[API_PROVIDER_REGISTER]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

