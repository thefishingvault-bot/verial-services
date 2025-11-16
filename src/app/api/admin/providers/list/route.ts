import { db } from '@/lib/db';
import { providers } from '@/db/schema';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';

export const runtime = 'nodejs';

// Helper function to check for Admin role
const isAdmin = async (userId: string): Promise<boolean> => {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return user.publicMetadata.role === 'admin';
};

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId || !(await isAdmin(userId))) {
      return new NextResponse('Forbidden: Requires admin role', { status: 403 });
    }

    // Fetch all providers
    const allProviders = await db.query.providers.findMany({
      orderBy: [desc(providers.createdAt)],
    });

    return NextResponse.json(allProviders);

  } catch (error) {
    console.error('[API_ADMIN_PROVIDERS_LIST]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

