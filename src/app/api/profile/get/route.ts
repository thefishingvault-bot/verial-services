import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // --- 1. Try to find the user in our DB ---
    let userProfile = await db.query.users.findFirst({
      where: eq(users.id, userId),
      with: {
        provider: {
          columns: { bio: true } // Also fetch provider bio
        }
      }
    });

    // --- 2. If not found, create (sync) them ---
    if (!userProfile) {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const userEmail = user.emailAddresses[0]?.emailAddress;
      if (!userEmail) {
        return new NextResponse('User email not found', { status: 400 });
      }

      await db.insert(users).values({
        id: userId,
        email: userEmail,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.imageUrl,
        role: 'user',
      }).onConflictDoNothing();

      // Try fetching again
      userProfile = await db.query.users.findFirst({
        where: eq(users.id, userId),
        with: { provider: { columns: { bio: true } } }
      });
    }

    if (!userProfile) {
        return new NextResponse('Failed to create or find user profile', { status: 500 });
    }

    return NextResponse.json(userProfile);

  } catch (error) {
    console.error('[API_PROFILE_GET]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

