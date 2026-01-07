import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  services,
  providers,
  reviews,
  serviceCategoryEnum,
  serviceFavorites,
} from "@/db/schema";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

type ServiceSummary = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  pricingType: (typeof services.pricingType.enumValues)[number];
  priceInCents: number | null;
  priceNote: string | null;
  category: (typeof serviceCategoryEnum.enumValues)[number];
  coverImageUrl: string | null;
  createdAt: Date;
  provider: {
    id: string;
    handle: string | null;
    businessName: string | null;
    isVerified: boolean;
    trustLevel: "bronze" | "silver" | "gold" | "platinum" | null;
    region: string | null;
    suburb: string | null;
  };
  avgRating: number;
  reviewCount: number;
  favoriteCount: number;
  isFavorited: boolean;
};

// Public route; optional auth only to mark user favorites.
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();

    const rate = await enforceRateLimit(req, {
      userId: userId ?? null,
      resource: "services:search",
      limit: 30,
      windowSeconds: 60,
    });

    if (!rate.success) {
      return rateLimitResponse(rate.retryAfter);
    }

    const { searchParams } = req.nextUrl;

    const rawCategory = searchParams.get("category") ?? undefined;
    const rawRegion = searchParams.get("region") ?? undefined;
    const rawSuburb = searchParams.get("suburb") ?? undefined;
    const rawQuery = searchParams.get("q") ?? undefined;
    const rawMinPrice = searchParams.get("minPrice") ?? undefined;
    const rawMaxPrice = searchParams.get("maxPrice") ?? undefined;
    const sort = (searchParams.get("sort") ?? "relevance") as
      | "relevance"
      | "price_asc"
      | "price_desc"
      | "rating_desc";

    const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
    const pageSizeRaw = parseInt(searchParams.get("pageSize") || "12", 10) || 12;
    const pageSize = Math.min(Math.max(pageSizeRaw, 1), 50);

    const isValidCategory = rawCategory
      ? (serviceCategoryEnum.enumValues as readonly string[]).includes(rawCategory)
      : false;

    const categoryFilter = isValidCategory ? rawCategory : undefined;

    const normalizeString = (value: string | null | undefined) =>
      value?.toString().trim().toLowerCase() || null;

    const regionFilter = normalizeString(rawRegion);
    const suburbFilter = normalizeString(rawSuburb);
    const textQuery = rawQuery?.trim();

    const parsePrice = (value: string | undefined) => {
      if (!value) return undefined;
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) return undefined;
      return Math.floor(n);
    };

    const minPrice = parsePrice(rawMinPrice);
    const maxPrice = parsePrice(rawMaxPrice);

    const conditions: (ReturnType<typeof and> | ReturnType<typeof eq> | ReturnType<typeof sql> | undefined)[] = [
      eq(providers.status, "approved"),
      // Only show published services in public search
      eq(services.isPublished, true),
      categoryFilter ? eq(services.category, categoryFilter as ServiceSummary["category"]) : undefined,
      regionFilter ? sql`LOWER(${services.region}) = ${regionFilter}` : undefined,
      suburbFilter ? sql`LOWER(${services.suburb}) = ${suburbFilter}` : undefined,
      minPrice != null ? sql`${services.priceInCents} >= ${minPrice}` : undefined,
      maxPrice != null ? sql`${services.priceInCents} <= ${maxPrice}` : undefined,
      textQuery
        ? sql`to_tsvector('simple', coalesce(${services.title}, '') || ' ' || coalesce(${services.description}, '')) @@ plainto_tsquery(${textQuery})`
        : undefined,
    ].filter((c): c is Exclude<(typeof conditions)[number], undefined> => Boolean(c));

    const avgRatingExpr = sql<number>`COALESCE((
      SELECT AVG(${reviews.rating})
      FROM ${reviews}
      WHERE ${reviews.serviceId} = ${services.id} AND ${reviews.isHidden} = false
    ), 0)`;

    const reviewCountExpr = sql<number>`(
      SELECT COUNT(*) FROM ${reviews} r
      WHERE r.service_id = ${services.id} AND r.is_hidden = false
    )`;

    let orderByClause;
    switch (sort) {
      case "price_asc":
        orderByClause = [asc(services.priceInCents)];
        break;
      case "price_desc":
        orderByClause = [desc(services.priceInCents)];
        break;
      case "rating_desc":
        orderByClause = [desc(avgRatingExpr), desc(reviewCountExpr), desc(services.createdAt)];
        break;
      case "relevance":
      default:
        orderByClause = [desc(services.createdAt)];
        break;
    }

    const offset = (page - 1) * pageSize;

    const baseQuery = db
      .select({
        id: services.id,
        title: services.title,
        slug: services.slug,
        description: services.description,
        pricingType: services.pricingType,
        priceInCents: services.priceInCents,
        priceNote: services.priceNote,
        category: services.category,
        coverImageUrl: services.coverImageUrl,
        createdAt: services.createdAt,
        providerId: providers.id,
        providerHandle: providers.handle,
        providerName: providers.businessName,
        providerVerified: providers.isVerified,
        providerTrust: providers.trustLevel,
        serviceRegion: services.region,
        serviceSuburb: services.suburb,
        avgRating: avgRatingExpr,
        reviewCount: reviewCountExpr,
        favoriteCount: sql<number>`(
          SELECT COUNT(*) FROM ${serviceFavorites} sf_all WHERE sf_all.service_id = ${services.id}
        )`,
        isFavorited: userId
          ? sql<boolean>`EXISTS (
              SELECT 1 FROM ${serviceFavorites} sf_user
              WHERE sf_user.service_id = ${services.id} AND sf_user.user_id = ${userId}
            )`
          : sql<boolean>`false`,
      })
      .from(services)
      .leftJoin(providers, eq(services.providerId, providers.id))
      .where(and(...conditions));

    const serviceResults = await baseQuery.orderBy(...orderByClause).limit(pageSize).offset(offset);

    const items: ServiceSummary[] = serviceResults.map((s) => {
      const avgRating = Number(s.avgRating ?? 0);
      const reviewCount = Number(s.reviewCount ?? 0);

      return {
        id: s.id,
        title: s.title,
        slug: s.slug,
        description: s.description,
        pricingType: s.pricingType,
        priceInCents: s.priceInCents,
        priceNote: s.priceNote,
        category: s.category as ServiceSummary["category"],
        coverImageUrl: s.coverImageUrl,
        createdAt: s.createdAt,
        provider: {
          id: s.providerId!,
          handle: s.providerHandle,
          businessName: s.providerName,
          isVerified: s.providerVerified ?? false,
          trustLevel: (s.providerTrust ?? "bronze") as ServiceSummary["provider"]["trustLevel"],
          region: s.serviceRegion,
          suburb: s.serviceSuburb,
        },
        avgRating,
        reviewCount,
        favoriteCount: Number(s.favoriteCount ?? 0),
        isFavorited: Boolean(s.isFavorited),
      };
    });

    const hasMore = items.length === pageSize;

    return NextResponse.json({
      services: items,
      page,
      pageSize,
      hasMore,
    });

  } catch (error) {
    console.error("[API_SERVICE_LIST]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

