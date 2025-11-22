import { db } from "@/lib/db";
import { services, providers, reviews, serviceCategoryEnum } from "@/db/schema";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type ServiceSummary = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  priceInCents: number;
  category: (typeof serviceCategoryEnum.enumValues)[number];
  coverImageUrl: string | null;
  createdAt: Date;
  provider: {
    id: string;
    handle: string | null;
    businessName: string | null;
    isVerified: boolean;
    trustLevel: "bronze" | "silver" | "gold" | "platinum" | null;
    baseRegion: string | null;
  };
  avgRating: number;
  reviewCount: number;
};

// This is a public route, no auth needed.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;

    const rawCategory = searchParams.get("category") ?? undefined;
    const rawRegion = searchParams.get("region") ?? undefined;
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

    const normalizeRegion = (value: string | null | undefined) =>
      value?.toString().trim().toLowerCase() || null;

    const regionFilter = normalizeRegion(rawRegion);

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
      categoryFilter ? eq(services.category, categoryFilter as ServiceSummary["category"]) : undefined,
      regionFilter
        ? sql`LOWER(${providers.baseRegion}) = ${regionFilter}`
        : undefined,
      minPrice != null ? sql`${services.priceInCents} >= ${minPrice}` : undefined,
      maxPrice != null ? sql`${services.priceInCents} <= ${maxPrice}` : undefined,
    ].filter((c): c is Exclude<(typeof conditions)[number], undefined> => Boolean(c));

    let orderByClause;
    switch (sort) {
      case "price_asc":
        orderByClause = [asc(services.priceInCents)];
        break;
      case "price_desc":
        orderByClause = [desc(services.priceInCents)];
        break;
      case "rating_desc":
        // Placeholder: fall back to createdAt desc until ratings join is more complex
        orderByClause = [desc(services.createdAt)];
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
        priceInCents: services.priceInCents,
        category: services.category,
        coverImageUrl: services.coverImageUrl,
        createdAt: services.createdAt,
        providerId: providers.id,
        providerHandle: providers.handle,
        providerName: providers.businessName,
        providerVerified: providers.isVerified,
        providerTrust: providers.trustLevel,
        providerBaseRegion: providers.baseRegion,
      })
      .from(services)
      .leftJoin(providers, eq(services.providerId, providers.id))
      .where(and(...conditions));

    const serviceResults = await baseQuery.orderBy(...orderByClause).limit(pageSize).offset(offset);

    const providerIds = [...new Set(serviceResults.map((s) => s.providerId))].filter(Boolean) as string[];

    const reviewMap: Record<string, { total: number; count: number }> = {};

    if (providerIds.length > 0) {
      const reviewData = await db
        .select({
          providerId: reviews.providerId,
          rating: reviews.rating,
        })
        .from(reviews)
        .where(inArray(reviews.providerId, providerIds));

      reviewData.forEach((r) => {
        const key = String(r.providerId);
        if (!reviewMap[key]) {
          reviewMap[key] = { total: 0, count: 0 };
        }
        reviewMap[key].total += r.rating ?? 0;
        reviewMap[key].count += 1;
      });
    }

    const items: ServiceSummary[] = serviceResults.map((s) => {
      const key = String(s.providerId);
      const stats = reviewMap[key] || { total: 0, count: 0 };
      const avgRating = stats.count > 0 ? stats.total / stats.count : 0;

      return {
        id: s.id,
        title: s.title,
        slug: s.slug,
        description: s.description,
        priceInCents: s.priceInCents,
        category: s.category as ServiceSummary["category"],
        coverImageUrl: s.coverImageUrl,
        createdAt: s.createdAt,
        provider: {
          id: s.providerId!,
          handle: s.providerHandle,
          businessName: s.providerName,
          isVerified: s.providerVerified ?? false,
          trustLevel: (s.providerTrust ?? "bronze") as ServiceSummary["provider"]["trustLevel"],
          baseRegion: s.providerBaseRegion,
        },
        avgRating,
        reviewCount: stats.count,
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

