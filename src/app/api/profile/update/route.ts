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

    // Destructure all possible fields
    const { firstName, lastName, bio, businessName, handle, avatarUrl } = await req.json();

    // --- 1. Update Clerk ---
    const client = await clerkClient();
    await client.users.updateUser(userId, {
      firstName: firstName,
      lastName: lastName,
      // We store the avatar URL in public metadata so we can access it easily later
      publicMetadata: { avatar_url: avatarUrl },
    });

    // --- 2. Update local 'users' table ---
    await db
      .update(users)
      .set({
        firstName: firstName,
        lastName: lastName,
        updatedAt: new Date(),
        avatarUrl: avatarUrl, // Update avatarUrl column
      })
      .where(eq(users.id, userId));

    // --- 3. Update Provider fields (if applicable) ---
    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
    });

    if (provider) {
      const providerUpdateData: { bio?: string; businessName?: string; handle?: string } = {};

      if (bio !== undefined) providerUpdateData.bio = bio;
      if (businessName !== undefined) providerUpdateData.businessName = businessName;
      if (handle !== undefined) providerUpdateData.handle = handle;

      if (Object.keys(providerUpdateData).length > 0) {
        await db
          .update(providers)
          .set(providerUpdateData)
          .where(eq(providers.id, provider.id));
      }
    } else if (businessName !== undefined || handle !== undefined) {
      // Safety check: Non-providers shouldn't be sending provider fields
      return new NextResponse('User is not a provider', { status: 403 });
    }

    console.log(`[API_PROFILE_UPDATE] User ${userId} updated their profile.`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API_PROFILE_UPDATE]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

