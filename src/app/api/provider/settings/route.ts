import { db } from '@/lib/db';
import { providerSuburbs } from '@/db/schema';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

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
        baseSuburb: true,
        baseRegion: true,
        serviceRadiusKm: true,
      },
    });

    if (!provider) {
      return new NextResponse('Provider not found', { status: 404 });
    }

    const coverage = await db
      .select({ region: providerSuburbs.region, suburb: providerSuburbs.suburb })
      .from(providerSuburbs)
      .where(eq(providerSuburbs.providerId, provider.id));

    return NextResponse.json({
      chargesGst: provider.chargesGst,
      baseSuburb: provider.baseSuburb,
      baseRegion: provider.baseRegion,
      serviceRadiusKm: provider.serviceRadiusKm,
      coverageRegion: provider.baseRegion,
      coverageSuburbs: coverage.map((row) => row.suburb),
    });

  } catch (error) {
    console.error('[API_PROVIDER_SETTINGS_GET]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

