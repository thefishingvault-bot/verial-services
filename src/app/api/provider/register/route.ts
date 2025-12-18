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

    const { businessName, handle } = await req.json();
    if (!businessName || !handle) {
      return new NextResponse("Missing businessName or handle", { status: 400 });
    }

    // Check if user already has a provider application
    const existingProvider = await db.query.providers.findFirst({
      where: (p, { eq }) => eq(p.userId, userId),
      columns: {
        id: true,
        status: true,
      },
    });

    // --- 1. Get user details from Clerk ---
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const userEmail = user.emailAddresses[0]?.emailAddress;
    if (!userEmail) {
      return new NextResponse("User email not found", { status: 400 });
    }

    const currentClerkRole = (user.publicMetadata as Record<string, unknown>)?.role as string | undefined;

    // --- 2. Create the User record (if it doesn't exist) ---
    // This ensures the foreign key constraint will pass.
    try {
      await db.insert(users).values({
        id: userId,
        email: userEmail,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.imageUrl,
        role: "user", // Providers only get access after admin approval
      }).onConflictDoNothing(); // If user already exists, do nothing
    } catch (dbError) {
      console.error("[API_PROVIDER_REGISTER] Error creating user record:", dbError);
      return new NextResponse("Failed to create user record", { status: 500 });
    }

    // Determine whether we should demote role (never demote admins).
    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { role: true },
    });
    const isAdmin = currentClerkRole === "admin" || dbUser?.role === "admin";

    // Ensure Clerk role is not prematurely set (but never downgrade admins).
    if (!isAdmin) {
      await client.users.updateUserMetadata(userId, {
        publicMetadata: {
          ...(user.publicMetadata as Record<string, unknown>),
          role: "user",
        },
      });
    }

    // If the user previously got rejected, allow resubmission by re-opening the same provider record.
    if (existingProvider) {
      if (existingProvider.status === 'rejected') {
        const [updatedProvider] = await db
          .update(providers)
          .set({
            businessName,
            handle,
            status: 'pending',
            isVerified: false,
            updatedAt: new Date(),
          })
          .where(eq(providers.id, existingProvider.id))
          .returning();

        await db
          .update(users)
          .set({ providerId: existingProvider.id, role: isAdmin ? 'admin' : 'user' })
          .where(eq(users.id, userId));

        console.log(`[API_PROVIDER_REGISTER] User ${userId} resubmitted Provider ${existingProvider.id}`);
        return NextResponse.json(updatedProvider);
      }

      return new NextResponse(
        existingProvider.status === 'pending'
          ? 'Provider application already submitted and awaiting review'
          : 'User is already an approved provider',
        { status: 400 },
      );
    }

    // --- 3. Create the new Provider record ---
    const newProviderId = generateProviderId();
    const [newProvider] = await db.insert(providers).values({
      id: newProviderId,
      userId: userId,
      businessName: businessName,
      handle: handle,
      // All other fields (status, trust, etc.) will use their defaults
    }).returning();

    // --- 4. Update the User record to link to the providerId (keep role as user until approved) ---
    await db.update(users)
      .set({ providerId: newProvider.id, role: isAdmin ? "admin" : "user" })
      .where(eq(users.id, userId));

    console.log(`[API_PROVIDER_REGISTER] User ${userId} successfully registered as Provider ${newProvider.id}`);
    return NextResponse.json(newProvider);

  } catch (error: unknown) {
    // Check for unique constraint violation on 'handle'
    if (typeof error === 'object' && error !== null) {
      const pgError = error as { code?: string; constraint?: string; detail?: string };
      if (pgError.code === '23505' && pgError.constraint?.includes('handle')) {
        const handleMatch = pgError.detail?.match(/\((.*?)\)/);
        const handleValue = handleMatch ? handleMatch[1] : 'this handle';
        return new NextResponse(`Handle '${handleValue}' is already taken.`, { status: 409 });
      }
    }
    console.error("[API_PROVIDER_REGISTER]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

