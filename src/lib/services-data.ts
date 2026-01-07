import { db } from '@/lib/db';
import { services, providers, users, reviews, serviceFavorites } from '@/db/schema';
import { eq, and, or, like, sql, desc, asc, gte, lte } from 'drizzle-orm';

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
  const category = getSingle('category')?.trim() || null;
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
    whereConditions.push(
      or(
        like(services.title, `%${filters.q}%`),
        like(services.description, `%${filters.q}%`),
        like(providers.businessName, `%${filters.q}%`),
      )!,
    );
  }

  if (filters.category) {
    const allowedCategories = [
      'cleaning',
      'plumbing',
      'gardening',
      'it_support',
      'accounting',
      'detailing',
      'other',
    ] as const;
    if ((allowedCategories as readonly string[]).includes(filters.category)) {
      whereConditions.push(
        eq(services.category, filters.category as (typeof allowedCategories)[number]),
      );
    }
  }

  if (filters.region) {
    whereConditions.push(sql`LOWER(${services.region}) = LOWER(${filters.region})`);
  }

  if (filters.minPrice != null) {
    whereConditions.push(gte(services.priceInCents, filters.minPrice * 100));
  }
  if (filters.maxPrice != null) {
    whereConditions.push(lte(services.priceInCents, filters.maxPrice * 100));
  }

  if (filters.rating != null) {
    whereConditions.push(sql`${avgRatingExpr} >= ${filters.rating}`);
  }

  const priceNullsLastExpr = sql<number>`CASE WHEN ${services.priceInCents} IS NULL THEN 1 ELSE 0 END`;

  let orderBy: any[] = [desc(services.createdAt)];
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
      orderBy = [desc(services.createdAt)];
      break;
  }

  const page = filters.page || 1;
  const limit = filters.pageSize || 12;
  const offset = (page - 1) * limit;

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
      avatarUrl: users.avatarUrl,
      firstName: users.firstName,
      lastName: users.lastName,
      isFavorite: sql<boolean>`CASE WHEN ${serviceFavorites.id} IS NOT NULL THEN true ELSE false END`,
      favoriteCount: sql<number>`(
        SELECT COUNT(*) FROM ${serviceFavorites} sf_all WHERE sf_all.service_id = ${services.id}
      )`,
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
      desc(sql`CASE WHEN ${serviceFavorites.id} IS NOT NULL THEN 1 ELSE 0 END`),
      ...orderBy,
    )
    .limit(limit)
    .offset(offset);

  const servicesWithProviders: ServiceWithProviderAndFavorite[] = servicesData.map((service) => {
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
