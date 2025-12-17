import { db } from '@/lib/db';
import { users, providers } from '@/db/schema';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { and, eq, ne } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function PATCH(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Destructure all possible fields
    const { firstName, lastName, bio, businessName, handle, avatarUrl } = await req.json();

    const normalizedHandle = typeof handle === 'string' ? handle.trim().toLowerCase() : undefined;
    const normalizedBusinessName = typeof businessName === 'string' ? businessName.trim() : undefined;
    const normalizedBio = typeof bio === 'string' ? bio.trim() : undefined;

    if (normalizedHandle !== undefined) {
      if (normalizedHandle.length < 3 || normalizedHandle.length > 50) {
        return new NextResponse('Invalid handle: must be between 3 and 50 characters', { status: 400 });
      }
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedHandle)) {
        return new NextResponse('Invalid handle: only lowercase letters, numbers, and dashes are allowed', { status: 400 });
      }

      const reserved = new Set([
        'admin',
        'api',
        'dashboard',
        'sign-in',
        'sign-up',
        'services',
        'p',
        's',
      ]);
      if (reserved.has(normalizedHandle)) {
        return new NextResponse('Invalid handle: this handle is reserved', { status: 400 });
      }
    }

    if (normalizedBusinessName !== undefined) {
      if (!normalizedBusinessName) {
        return new NextResponse('Invalid businessName: business name is required', { status: 400 });
      }
      if (normalizedBusinessName.length > 255) {
        return new NextResponse('Invalid businessName: too long', { status: 400 });
      }
    }

    if (normalizedBio !== undefined && normalizedBio.length > 2000) {
      return new NextResponse('Invalid bio: too long', { status: 400 });
    }

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

      if (normalizedBio !== undefined) providerUpdateData.bio = normalizedBio;
      if (normalizedBusinessName !== undefined) providerUpdateData.businessName = normalizedBusinessName;
      if (normalizedHandle !== undefined) {
        const existingHandle = await db.query.providers.findFirst({
          where: and(eq(providers.handle, normalizedHandle), ne(providers.id, provider.id)),
          columns: { id: true },
        });
        if (existingHandle) {
          return new NextResponse('Handle already taken', { status: 409 });
        }
        providerUpdateData.handle = normalizedHandle;
      }

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

