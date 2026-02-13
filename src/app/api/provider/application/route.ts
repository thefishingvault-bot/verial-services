import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const provider = await db.query.providers.findFirst({
      where: (p, { eq }) => eq(p.userId, userId),
      columns: {
        id: true,
        status: true,
        isVerified: true,
        businessName: true,
        handle: true,
        updatedAt: true,
        createdAt: true,
        verificationStatus: true,
      },
    });

    if (!provider) {
      return NextResponse.json({
        exists: false,
        providerId: null,
        status: 'none',
        isVerified: false,
        businessName: null,
        handle: null,
        verificationStatus: null,
        createdAt: null,
        updatedAt: null,
      });
    }

    return NextResponse.json({
      exists: true,
      providerId: provider.id,
      status: provider.status,
      isVerified: provider.isVerified,
      businessName: provider.businessName,
      handle: provider.handle,
      verificationStatus: provider.verificationStatus,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    });
  } catch (error) {
    console.error('[API_PROVIDER_APPLICATION_GET]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
