import { db } from '@/lib/db';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Fetch the provider record for this user
    const provider = await db.query.providers.findFirst({
      where: (p, { eq }) => eq(p.userId, userId),
      columns: {
        id: true,
        chargesGst: true,
      },
    });

    if (!provider) {
      return new NextResponse('Provider not found', { status: 404 });
    }

    return NextResponse.json({ chargesGst: provider.chargesGst });

  } catch (error) {
    console.error('[API_PROVIDER_SETTINGS_GET]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

