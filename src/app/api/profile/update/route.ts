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

    const {
      firstName,
      lastName,
      bio,
      businessName,
      handle,
      avatarUrl,
    } = await req.json();

    // --- 1. Update Clerk (name + avatar metadata) ---
    const client = await clerkClient();
    const clerkUpdate: Record<string, unknown> = {};

    if (typeof firstName === 'string') {
      clerkUpdate.firstName = firstName;
    }
    if (typeof lastName === 'string') {
      clerkUpdate.lastName = lastName;
    }
    if (typeof avatarUrl === 'string') {
      clerkUpdate.publicMetadata = { avatar_url: avatarUrl };
    }

    if (Object.keys(clerkUpdate).length > 0) {
      await client.users.updateUser(userId, clerkUpdate);
    }

    // --- 2. Update our local 'users' table ---
    const userUpdateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (typeof firstName === 'string') {
      userUpdateData.firstName = firstName;
    }
    if (typeof lastName === 'string') {
      userUpdateData.lastName = lastName;
    }
    if (typeof avatarUrl === 'string') {
      userUpdateData.avatarUrl = avatarUrl;
    }

    await db
      .update(users)
      .set(userUpdateData)
      .where(eq(users.id, userId));

    // --- 3. Provider-specific fields (bio, businessName, handle) ---
    if (bio !== undefined || businessName !== undefined || handle !== undefined) {
      const provider = await db.query.providers.findFirst({
        where: eq(providers.userId, userId),
      });

      if (provider) {
        const providerUpdateData: {
          bio?: string;
          businessName?: string;
          handle?: string;
        } = {};

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
        return new NextResponse('User is not a provider', { status: 403 });
      }
    }

    console.log(`[API_PROFILE_UPDATE] User ${userId} updated their profile.`);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[API_PROFILE_UPDATE]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

