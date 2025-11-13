import { db } from '@/lib/db';
import { users, providers } from '@/db/schema';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function PATCH(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { firstName, lastName, bio } = await req.json();

    // --- 1. Update Clerk ---
    // This is the source of truth for name/avatar
    const client = await clerkClient();
    await client.users.updateUser(userId, {
      firstName: firstName,
      lastName: lastName,
    });

    // --- 2. Update our local 'users' table ---
    await db.update(users)
      .set({
        firstName: firstName,
        lastName: lastName,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // --- 3. If 'bio' is provided, update the 'providers' table ---
    if (bio !== undefined) {
      const provider = await db.query.providers.findFirst({
        where: eq(providers.userId, userId),
      });

      if (provider) {
        await db.update(providers)
          .set({ bio: bio })
          .where(eq(providers.id, provider.id));
      }
    }

    console.log(`[API_PROFILE_UPDATE] User ${userId} updated their profile.`);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[API_PROFILE_UPDATE]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

