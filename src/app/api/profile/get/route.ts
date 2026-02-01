import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { ensureUserExistsInDb } from '@/lib/user-sync';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Ensure the user exists in our DB (handles recreated Clerk users with same email).
    await ensureUserExistsInDb(userId, 'customer');

    // --- 1. Try to find the user in our DB ---
    const userProfile = await db.query.users.findFirst({
      where: eq(users.id, userId),
      with: {
        provider: {
          columns: {
            bio: true,
            businessName: true,
            handle: true,
            trustLevel: true,
            trustScore: true,
          }, // Also fetch provider fields
        },
      },
    });

    if (!userProfile) {
        return new NextResponse('Failed to create or find user profile', { status: 500 });
    }

    return NextResponse.json(userProfile);

  } catch (error) {
    console.error('[API_PROFILE_GET]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

