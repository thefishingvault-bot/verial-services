import { db } from '@/lib/db';
import { providers } from '@/db/schema';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function PATCH(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const body = await req.json();
    const { chargesGst, baseSuburb, baseRegion, serviceRadiusKm } = body as {
      chargesGst: boolean;
      baseSuburb?: string | null;
      baseRegion?: string | null;
      serviceRadiusKm?: number | null;
    };

    if (typeof chargesGst !== 'boolean') {
      return new NextResponse('Invalid input: chargesGst must be a boolean', { status: 400 });
    }

    if (baseSuburb != null && typeof baseSuburb !== 'string') {
      return new NextResponse('Invalid input: baseSuburb must be a string', { status: 400 });
    }

    if (baseRegion != null && typeof baseRegion !== 'string') {
      return new NextResponse('Invalid input: baseRegion must be a string', { status: 400 });
    }

    let radiusToSave: number | undefined;
    if (serviceRadiusKm != null) {
      if (typeof serviceRadiusKm !== 'number' || !Number.isFinite(serviceRadiusKm)) {
        return new NextResponse('Invalid input: serviceRadiusKm must be a number', { status: 400 });
      }

      if (serviceRadiusKm < 5 || serviceRadiusKm > 50) {
        return new NextResponse('Invalid input: serviceRadiusKm must be between 5 and 50', { status: 400 });
      }

      // Normalise to integer step of 5
      radiusToSave = Math.round(serviceRadiusKm / 5) * 5;
    }

    // Update the provider record for this user
    const updateData: Partial<typeof providers.$inferInsert> = {
      chargesGst,
      updatedAt: new Date(),
    };

    if (baseSuburb !== undefined) {
      updateData.baseSuburb = baseSuburb === null || baseSuburb.trim() === '' ? null : baseSuburb.trim();
    }

    if (baseRegion !== undefined) {
      updateData.baseRegion = baseRegion === null || baseRegion.trim() === '' ? null : baseRegion.trim();
    }

    if (radiusToSave !== undefined) {
      updateData.serviceRadiusKm = radiusToSave;
    }

    const [updatedProvider] = await db.update(providers)
      .set(updateData)
      .where(eq(providers.userId, userId))
      .returning();

    if (!updatedProvider) {
      return new NextResponse('Provider not found', { status: 404 });
    }

    console.log(`[API_PROVIDER_SETTINGS] Provider ${updatedProvider.id} set chargesGst to ${chargesGst}`);
    return NextResponse.json(updatedProvider);

  } catch (error) {
    console.error('[API_PROVIDER_SETTINGS]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

