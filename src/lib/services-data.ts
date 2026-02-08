import { db } from '@/lib/db';
import { services, providers, users, reviews, serviceFavorites, serviceCategoryEnum } from '@/db/schema';
import { eq, and, sql, desc, asc, gte, lte, type SQL } from 'drizzle-orm';
import { buildMostRelevantOrderBy, buildMostRelevantScoring, getPublicPlanBadge, type PublicPlanBadge } from '@/lib/services-most-relevant';

export type ServicesSearchParams = Record<string, string | string[] | undefined>;

export type ServicesFilters = {
  q: string;
  category: string | null;
  region: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  rating: number | null;
  sort: 'relevance' | 'price_asc' | 'price_desc' | 'rating_desc' | 'newest';
  page: number;
  pageSize: number;
};

export interface ServiceWithProvider {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  pricingType: 'fixed' | 'from' | 'quote';
  priceInCents: number | null;
  priceNote: string | null;
  category: string;
  coverImageUrl: string | null;
  createdAt: Date;
  provider: {
    id: string;
    businessName: string | null;
    handle: string | null;
    region: string | null;
    suburb: string | null;
    trustScore: number;
    isVerified: boolean;
    avatarUrl: string | null;
    planBadge: PublicPlanBadge | null;
    averageResponseTime?: string; // e.g., "2h 15m", "under 1h"
  };
  user: {
    firstName: string | null;
    lastName: string | null;
  };
  avgRating: number;
  reviewCount: number;
  favoriteCount: number;
}

export type ServiceWithProviderAndFavorite = ServiceWithProvider & {
  isFavorite: boolean;
};
export function parseServicesSearchParams(
  searchParams: ServicesSearchParams,
): ServicesFilters {
  const getSingle = (key: string): string | undefined => {
    const value = searchParams[key];
    if (Array.isArray(value)) return value[0];
    return value;
  };

  const q = getSingle('q')?.trim() ?? '';
  const rawCategory = getSingle('category')?.trim();
  const category = rawCategory && (serviceCategoryEnum.enumValues as readonly string[]).includes(rawCategory)
    ? rawCategory
    : null;
  const region = getSingle('region')?.trim() || null;

  const minPriceRaw = getSingle('minPrice');
  const maxPriceRaw = getSingle('maxPrice');
  const ratingRaw = getSingle('rating');
  const sortRaw = getSingle('sort');
  const pageRaw = getSingle('page');
  const pageSizeRaw = getSingle('pageSize');

  const toNumber = (value?: string | null): number | null => {
    if (!value) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const minPrice = toNumber(minPriceRaw);
  const maxPrice = toNumber(maxPriceRaw);
  const rating = toNumber(ratingRaw);
  const page = Math.max(Number(pageRaw ?? 1) || 1, 1);
  const pageSize = Math.min(Math.max(Number(pageSizeRaw ?? 12) || 12, 1), 50);

  const allowedSorts = new Set<ServicesFilters['sort']>([
    'relevance',
    'price_asc',
    'price_desc',
    'rating_desc',
    'newest',
  ]);

  const sort: ServicesFilters['sort'] = sortRaw && allowedSorts.has(sortRaw as ServicesFilters['sort'])
    ? (sortRaw as ServicesFilters['sort'])
    : 'relevance';

  return {
    q,
    category,
    region,
    minPrice,
    maxPrice,
    rating,
    sort,
    page,
    pageSize,
  };
}

export type ServicesDataResult = {
  filters: ServicesFilters;
  services: ServiceWithProviderAndFavorite[];
  totalCount: number;
  hasMore: boolean;
  kpi: {
    activeServices: number;
    satisfactionRate: number | null;
    avgResponseMinutes: number | null;
  };
};

export async function getServicesDataFromSearchParams(
  searchParams: ServicesSearchParams,
  userId?: string | null,
): Promise<ServicesDataResult> {
  const filters = parseServicesSearchParams(searchParams);

  const avgRatingExpr = sql<number>`COALESCE((
    SELECT AVG(${reviews.rating})
    FROM ${reviews}
    WHERE ${reviews.serviceId} = ${services.id}
      AND ${reviews.isHidden} = false
  ), 0)`;
  const reviewCountExpr = sql<number>`COALESCE((
    SELECT COUNT(*)
    FROM ${reviews}
    WHERE ${reviews.serviceId} = ${services.id}
      AND ${reviews.isHidden} = false
  ), 0)`;

  const whereConditions = [eq(providers.status, 'approved')];

  if (filters.q) {
    const q = `%${filters.q.toLowerCase()}%`;
    whereConditions.push(
      sql`(
        LOWER(${services.title}) LIKE ${q}
        OR LOWER(COALESCE(${services.description}, '')) LIKE ${q}
        OR LOWER(${providers.businessName}) LIKE ${q}
        OR LOWER(${providers.handle}) LIKE ${q}
      )`,
    );
  }

  if (filters.category) {
    whereConditions.push(eq(services.category, filters.category as (typeof serviceCategoryEnum.enumValues)[number]));
  }

  if (filters.region) {
    whereConditions.push(sql`LOWER(${services.region}) = LOWER(${filters.region})`);
  }

  if (filters.minPrice != null) {
    whereConditions.push(gte(services.priceInCents, Math.round(filters.minPrice * 100)));
  }
  if (filters.maxPrice != null) {
    whereConditions.push(lte(services.priceInCents, Math.round(filters.maxPrice * 100)));
  }

  if (filters.rating != null) {
    whereConditions.push(sql`${avgRatingExpr} >= ${filters.rating}`);
  }

  const priceNullsLastExpr = sql<number>`CASE WHEN ${services.priceInCents} IS NULL THEN 1 ELSE 0 END`;

  const favoriteCountExpr = sql<number>`(
    SELECT COUNT(*) FROM ${serviceFavorites} sf_all WHERE sf_all.service_id = ${services.id}
  )`;

  let orderBy: SQL[] = [desc(services.createdAt)];
  switch (filters.sort) {
    case 'rating_desc':
      orderBy = [desc(avgRatingExpr)];
      break;
    case 'price_asc':
      orderBy = [asc(priceNullsLastExpr), asc(services.priceInCents)];
      break;
    case 'price_desc':
      orderBy = [asc(priceNullsLastExpr), desc(services.priceInCents)];
      break;
    case 'newest':
      orderBy = [desc(services.createdAt)];
      break;
    case 'relevance':
    default:
      orderBy = buildMostRelevantOrderBy({
        q: filters.q || null,
        avgRatingExpr,
        reviewCountExpr,
        favoriteCountExpr,
      });
      break;
  }

  const page = filters.page || 1;
  const limit = filters.pageSize || 12;
  const offset = (page - 1) * limit;

  if (filters.sort === 'relevance' && process.env.DEBUG_RELEVANCE === '1') {
    const scoring = buildMostRelevantScoring({
      q: filters.q || null,
      avgRatingExpr,
      reviewCountExpr,
      favoriteCountExpr,
    });

    const top = await db
      .select({
        serviceId: services.id,
        providerId: providers.id,
        title: services.title,
        providerPlan: providers.plan,
        subscriptionStatus: providers.stripeSubscriptionStatus,
        isVerified: providers.isVerified,
        planRank: scoring.planRankExpr,
        relevanceScore: scoring.baseScoreExpr,
      })
      .from(services)
      .innerJoin(providers, eq(services.providerId, providers.id))
      .innerJoin(users, eq(providers.userId, users.id))
      .where(and(...whereConditions))
      .orderBy(...scoring.orderBy)
      .limit(10);

    const elitePositions = top
      .map((r, idx) => ({ idx: idx + 1, plan: r.providerPlan }))
      .filter((r) => r.plan === 'elite')
      .map((r) => r.idx);

    const proPositions = top
      .map((r, idx) => ({ idx: idx + 1, plan: r.providerPlan }))
      .filter((r) => r.plan === 'pro')
      .map((r) => r.idx);

    console.info('[SERVICES_RELEVANCE_DEBUG] top10', {
      q: filters.q || null,
      category: filters.category,
      region: filters.region,
      minPrice: filters.minPrice,
      maxPrice: filters.maxPrice,
      rating: filters.rating,
      elitePositions,
      proPositions,
      results: top.map((r, idx) => ({
        rank: idx + 1,
        serviceId: r.serviceId,
        providerId: r.providerId,
        title: r.title,
        providerPlan: r.providerPlan,
        subscriptionStatus: r.subscriptionStatus,
        isVerified: r.isVerified,
        planRank: Number(r.planRank ?? 0),
        relevanceScore: Number(r.relevanceScore ?? 0),
      })),
    });
  }

  const totalCountResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(services)
    .innerJoin(providers, eq(services.providerId, providers.id))
    .innerJoin(users, eq(providers.userId, users.id))
    .where(and(...whereConditions));

  const totalCount = totalCountResult[0]?.count || 0;

  const servicesData = await db
    .select({
      id: services.id,
      slug: services.slug,
      title: services.title,
      description: services.description,
      pricingType: services.pricingType,
      priceInCents: services.priceInCents,
      priceNote: services.priceNote,
      category: services.category,
      coverImageUrl: services.coverImageUrl,
      createdAt: services.createdAt,
      providerId: services.providerId,
      businessName: providers.businessName,
      handle: providers.handle,
      region: services.region,
      suburb: services.suburb,
      trustScore: providers.trustScore,
      trustLevel: providers.trustLevel,
      isVerified: providers.isVerified,
      providerPlan: providers.plan,
      providerStripeSubscriptionStatus: providers.stripeSubscriptionStatus,
      avatarUrl: users.avatarUrl,
      firstName: users.firstName,
      lastName: users.lastName,
      isFavorite: sql<boolean>`CASE WHEN ${serviceFavorites.id} IS NOT NULL THEN true ELSE false END`,
      favoriteCount: favoriteCountExpr,
      avgRating: avgRatingExpr,
      reviewCount: reviewCountExpr,
    })
    .from(services)
    .innerJoin(providers, eq(services.providerId, providers.id))
    .innerJoin(users, eq(providers.userId, users.id))
    .leftJoin(
      serviceFavorites,
      userId
        ? and(
            eq(serviceFavorites.serviceId, services.id),
            eq(serviceFavorites.userId, userId),
          )
        : and(eq(serviceFavorites.serviceId, services.id), sql`1 = 0`),
    )
    .where(and(...whereConditions))
    .orderBy(
      ...(filters.sort === 'relevance'
        ? orderBy
        : [desc(sql`CASE WHEN ${serviceFavorites.id} IS NOT NULL THEN 1 ELSE 0 END`), ...orderBy]),
    )
    .limit(limit)
    .offset(offset);

  const servicesWithProviders: ServiceWithProviderAndFavorite[] = servicesData.map((service) => {
    const planBadge = getPublicPlanBadge({
      plan: service.providerPlan,
      stripeSubscriptionStatus: service.providerStripeSubscriptionStatus,
    });

    return {
      id: service.id,
      slug: service.slug,
      title: service.title,
      description: service.description,
      pricingType: service.pricingType,
      priceInCents: service.priceInCents,
      priceNote: service.priceNote,
      category: service.category,
      coverImageUrl: service.coverImageUrl,
      createdAt: service.createdAt,
      favoriteCount: Number(service.favoriteCount ?? 0),
      provider: {
        id: service.providerId,
        businessName: service.businessName,
        handle: service.handle,
        suburb: service.suburb,
        region: service.region,
        trustScore: service.trustScore,
        isVerified: service.isVerified,
        avatarUrl: service.avatarUrl,
        planBadge,
      },
      user: {
        firstName: service.firstName,
        lastName: service.lastName,
      },
      avgRating: Number(service.avgRating ?? 0),
      reviewCount: Number(service.reviewCount ?? 0),
      isFavorite: service.isFavorite ?? false,
    };
  });

  const [activeServicesRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(services)
    .innerJoin(providers, eq(services.providerId, providers.id))
    .where(eq(providers.status, 'approved'));

  const [satisfactionRow] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      satisfied: sql<number>`COUNT(*) FILTER (WHERE ${reviews.rating} >= 4)`,
    })
    .from(reviews)
    .innerJoin(services, eq(reviews.serviceId, services.id))
    .innerJoin(providers, eq(services.providerId, providers.id))
    .where(and(eq(providers.status, 'approved'), eq(reviews.isHidden, false)));

  const totalReviews = Number(satisfactionRow?.total ?? 0);
  const satisfiedReviews = Number(satisfactionRow?.satisfied ?? 0);
  const satisfactionRate =
    totalReviews > 0
      ? Math.round((satisfiedReviews / totalReviews) * 100)
      : null;

  const kpi = {
    activeServices: Number(activeServicesRow?.count ?? 0),
    satisfactionRate,
    avgResponseMinutes: null,
  };

  return {
    filters,
    services: servicesWithProviders,
    totalCount,
    hasMore: page * limit < totalCount,
    kpi,
  };
}
