import { db } from '@/lib/db';
import { providers } from '@/db/schema';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { and, desc, eq, ilike, or } from 'drizzle-orm';

export const runtime = 'nodejs';

// Helper function to check for Admin role
const isAdmin = async (userId: string): Promise<boolean> => {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return user.publicMetadata.role === 'admin';
};

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId || !(await isAdmin(userId))) {
      return new NextResponse('Forbidden: Requires admin role', { status: 403 });
    }

    const { searchParams } = new URL(request.url);

    const q = searchParams.get('q')?.trim() || '';
    const status = searchParams.get('status');
    const region = searchParams.get('region');
    const charges = searchParams.get('charges');
    const payouts = searchParams.get('payouts');

    const whereClauses: ReturnType<typeof and | typeof eq | typeof or>[] = [];

    if (q) {
      const like = `%${q}%`;
      whereClauses.push(
        or(
          ilike(providers.handle, like),
          ilike(providers.businessName, like),
          ilike(providers.userId, like),
        ),
      );
    }

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      whereClauses.push(eq(providers.status, status as 'pending' | 'approved' | 'rejected'));
    }

    if (region && region !== 'all') {
      whereClauses.push(eq(providers.baseRegion, region));
    }

    if (charges === '1') {
      whereClauses.push(eq(providers.chargesEnabled, true));
    }

    if (payouts === '1') {
      whereClauses.push(eq(providers.payoutsEnabled, true));
    }

    const allProviders = await db.query.providers.findMany({
      where: whereClauses.length
        ? and(...whereClauses)
        : undefined,
      orderBy: [desc(providers.createdAt)],
    });

    return NextResponse.json(allProviders);

  } catch (error) {
    console.error('[API_ADMIN_PROVIDERS_LIST]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

