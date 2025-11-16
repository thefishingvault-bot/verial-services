import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function DELETE() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // 1. Delete from our local database first.
    // The 'onDelete: cascade' on the 'providers' table
    // and 'onDelete: set null' on the 'bookings' table
    // will handle data cleanup.
    await db.delete(users).where(eq(users.id, userId));

    // 2. Delete from Clerk (this is the source of truth)
    const client = await clerkClient();
    await client.users.deleteUser(userId);

    console.log(`[API_PROFILE_DELETE] User ${userId} successfully deleted.`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API_PROFILE_DELETE]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

