import { db } from '@/lib/db';
import { providers, providerSuburbs, services } from '@/db/schema';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { assertProviderCanTransactFromProvider } from '@/lib/provider-access';
import { providerCategorySelectionSchema } from '@/lib/provider-categories';

export const runtime = 'nodejs';

export async function PATCH(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const body = await req.json();
    const {
      chargesGst,
      baseSuburb,
      baseRegion,
      serviceRadiusKm,
      coverageSuburbs,
      gstNumber,
      categories,
      primaryCategory,
      customCategory,
    } = body as {
      chargesGst: boolean;
      baseSuburb?: string | null;
      baseRegion?: string | null;
      serviceRadiusKm?: number | null;
      coverageSuburbs?: string[];
      gstNumber?: string | null;
      categories?: unknown;
      primaryCategory?: unknown;
      customCategory?: unknown;
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

    if (gstNumber != null && typeof gstNumber !== 'string') {
      return new NextResponse('Invalid input: gstNumber must be a string', { status: 400 });
    }

    const hasAnyCategoryInput = categories !== undefined || primaryCategory !== undefined || customCategory !== undefined;
    let parsedCategories:
      | {
          categories: string[];
          primaryCategory: string;
          customCategory: string | null;
        }
      | undefined;

    if (hasAnyCategoryInput) {
      const normalizedCategories = Array.isArray(categories)
        ? categories.filter((value): value is string => typeof value === 'string')
        : [];
      const normalizedPrimaryCategory = typeof primaryCategory === 'string' ? primaryCategory : '';
      const normalizedCustomCategory =
        customCategory == null
          ? null
          : typeof customCategory === 'string'
            ? customCategory
            : '';

      const parsedSelection = providerCategorySelectionSchema.safeParse({
        categories: normalizedCategories,
        primaryCategory: normalizedPrimaryCategory,
        customCategory: normalizedCustomCategory,
      });

      if (!parsedSelection.success) {
        return new NextResponse(parsedSelection.error.issues[0]?.message ?? 'Invalid provider categories', { status: 400 });
      }

      parsedCategories = {
        categories: parsedSelection.data.categories,
        primaryCategory: parsedSelection.data.primaryCategory,
        customCategory: parsedSelection.data.customCategory?.trim() || null,
      };
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

    const provider = await db.query.providers.findFirst({
      where: (p, { eq }) => eq(p.userId, userId),
      columns: {
        id: true,
        isSuspended: true,
        suspensionReason: true,
        suspensionStartDate: true,
        suspensionEndDate: true,
      },
    });

    if (!provider) {
      return new NextResponse('Provider not found', { status: 404 });
    }

    const access = assertProviderCanTransactFromProvider(provider);
    if (!access.ok) return access.response;

    const normalizedCoverageRegion = baseRegion === undefined
      ? undefined
      : (baseRegion === null || baseRegion.trim() === '' ? null : baseRegion.trim());

    let normalizedCoverageSuburbs: string[] | undefined;
    if (coverageSuburbs !== undefined) {
      if (!Array.isArray(coverageSuburbs)) {
        return new NextResponse('Invalid input: coverageSuburbs must be an array of strings', { status: 400 });
      }
      normalizedCoverageSuburbs = coverageSuburbs
        .map((s) => (typeof s === 'string' ? s.trim() : ''))
        .filter((s) => s.length > 0);

      if (normalizedCoverageRegion && normalizedCoverageSuburbs.length === 0) {
        return new NextResponse('Invalid input: at least one suburb is required when a region is set', { status: 400 });
      }
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

    if (parsedCategories) {
      updateData.categories = parsedCategories.categories;
      updateData.primaryCategory = parsedCategories.primaryCategory;
      updateData.customCategory = parsedCategories.customCategory;
    }

    if (gstNumber !== undefined) {
      updateData.gstNumber = gstNumber === null || gstNumber.trim() === '' ? null : gstNumber.trim();
    }

    if (normalizedCoverageSuburbs && normalizedCoverageSuburbs.length > 0 && normalizedCoverageRegion) {
      updateData.baseSuburb = normalizedCoverageSuburbs[0];
      updateData.baseRegion = normalizedCoverageRegion;
    }

    // NOTE: Neon HTTP driver does not support transactions. We perform updates sequentially.
    const [updatedProvider] = await db.update(providers)
      .set(updateData)
      .where(eq(providers.userId, userId))
      .returning();

    if (!updatedProvider) {
      return new NextResponse('Provider not found', { status: 404 });
    }

    if (normalizedCoverageSuburbs !== undefined && normalizedCoverageRegion !== undefined) {
      await db.delete(providerSuburbs).where(eq(providerSuburbs.providerId, provider.id));

      if (normalizedCoverageRegion && normalizedCoverageSuburbs.length > 0) {
        await db.insert(providerSuburbs).values(
          normalizedCoverageSuburbs.map((suburb) => ({
            providerId: provider.id,
            region: normalizedCoverageRegion,
            suburb,
          })),
        );
      }
    }

    // Keep service listings in sync with provider-level settings.
    await db
      .update(services)
      .set({
        chargesGst: updatedProvider.chargesGst,
        region: updatedProvider.baseRegion,
        suburb: updatedProvider.baseSuburb,
        updatedAt: new Date(),
      })
      .where(eq(services.providerId, provider.id));

    console.log(`[API_PROVIDER_SETTINGS] Provider ${updatedProvider.id} updated coverage`);
    return NextResponse.json(updatedProvider);

  } catch (error) {
    console.error('[API_PROVIDER_SETTINGS]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

