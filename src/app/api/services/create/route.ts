import { db } from "@/lib/db";
import { services, serviceCategoryEnum } from "@/db/schema";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { NZ_REGIONS } from "@/lib/data/nz-locations";

export const runtime = "nodejs";

// Helper function to create a unique ID
const generateServiceId = () => `svc_${new Date().getTime()}_${Math.random().toString(36).substring(2, 9)}`;

// Helper function to create a slug
const createSlug = (title: string) => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/[\s-]+/g, '-')     // Replace spaces/hyphens with a single hyphen
    .replace(/^-+|-+$/g, '');    // Trim hyphens
};

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Get the provider record for this user
    const provider = await db.query.providers.findFirst({
      where: (p, { eq }) => eq(p.userId, userId),
    });

    if (!provider) {
      return new NextResponse("Not a provider. Register as a provider first.", { status: 403 });
    }

    if (provider.status === 'rejected') {
      return new NextResponse('Your provider application was rejected. You cannot create services.', { status: 403 });
    }

    const body = (await req.json()) as {
      title?: string;
      description?: string | null;
      pricingType?: string;
      priceInCents?: number | null;
      priceNote?: string | null;
      category?: string;
    };
    const { title, description, pricingType, priceInCents, priceNote, category } = body;

    if (!title || !category || !pricingType) {
      return new NextResponse(
        "Missing required fields: title, category, pricingType",
        { status: 400 },
      );
    }

    if (!['fixed', 'from', 'quote'].includes(pricingType)) {
      return new NextResponse(`Invalid pricingType: ${pricingType}`, { status: 400 });
    }

    const normalizedPriceNote = typeof priceNote === 'string' && priceNote.trim().length
      ? priceNote.trim().slice(0, 500)
      : null;

    const effectivePriceInCents = pricingType === 'quote'
      ? null
      : (typeof priceInCents === 'number' ? priceInCents : null);

    if (pricingType !== 'quote') {
      if (effectivePriceInCents == null || !Number.isFinite(effectivePriceInCents) || effectivePriceInCents <= 0) {
        return new NextResponse("priceInCents must be a positive number for fixed/from pricing", { status: 400 });
      }
    }

    const providerRegion = provider.baseRegion;
    const providerSuburb = provider.baseSuburb;

    if (!providerRegion || !providerSuburb) {
      return new NextResponse(
        'Please set your service area (base region/suburb) in /dashboard/provider/profile before creating services.',
        { status: 400 },
      );
    }

    const validRegion = Object.keys(NZ_REGIONS).includes(providerRegion);
    const validSuburb = validRegion ? NZ_REGIONS[providerRegion].includes(providerSuburb) : false;

    if (!(serviceCategoryEnum.enumValues as readonly string[]).includes(category)) {
      return new NextResponse(`Invalid category: ${category}`, { status: 400 });
    }

    const categoryValue = category as (typeof serviceCategoryEnum.enumValues)[number];

    if (!validRegion || !validSuburb) {
      return new NextResponse(
        'Your service area (base region/suburb) is invalid. Please update it in /dashboard/provider/profile.',
        { status: 400 },
      );
    }

    const slug = createSlug(title);

    const [newService] = await db.insert(services).values({
      id: generateServiceId(),
      providerId: provider.id,
      title: title,
      description: description,
      pricingType: pricingType as 'fixed' | 'from' | 'quote',
      priceInCents: effectivePriceInCents,
      priceNote: normalizedPriceNote,
      category: categoryValue,
      slug: `${slug}-${Math.random().toString(36).substring(2, 8)}`, // Add random suffix to ensure uniqueness for MVP
      chargesGst: provider.chargesGst,
      region: providerRegion,
      suburb: providerSuburb,
      isPublished: false,
    }).returning();

    console.log(`[API_SERVICE_CREATE] Provider ${provider.id} created Service ${newService.id}`);
    return NextResponse.json(newService);

  } catch (error) {
    console.error("[API_SERVICE_CREATE]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

