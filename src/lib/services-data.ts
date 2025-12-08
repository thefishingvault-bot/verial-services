import { db } from '@/lib/db';
import { services, providers, users, reviews, serviceFavorites } from '@/db/schema';
import { eq, and, or, like, sql, desc, asc, gte, lte, avg } from 'drizzle-orm';

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
  priceInCents: number;
  category: string;
  coverImageUrl: string | null;
  createdAt: Date;
  provider: {
    id: string;
    businessName: string | null;
    handle: string | null;
    baseSuburb: string | null;
    baseRegion: string | null;
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
  distance?: number;
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
    satisfactionRate: number;
    avgResponseMinutes: number | null;
  };
};

export async function getServicesDataFromSearchParams(
  searchParams: ServicesSearchParams,
  userId?: string | null,
): Promise<ServicesDataResult> {
  const filters = parseServicesSearchParams(searchParams);

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
    whereConditions.push(sql`LOWER(${providers.baseRegion}) = LOWER(${filters.region})`);
  }

  if (filters.minPrice != null) {
    whereConditions.push(gte(services.priceInCents, filters.minPrice * 100));
  }
  if (filters.maxPrice != null) {
    whereConditions.push(lte(services.priceInCents, filters.maxPrice * 100));
  }

  let orderBy = desc(services.createdAt);
  switch (filters.sort) {
    case 'rating_desc':
      orderBy = desc(sql`COALESCE(avg_rating, 0)`);
      break;
    case 'price_asc':
      orderBy = asc(services.priceInCents);
      break;
    case 'price_desc':
      orderBy = desc(services.priceInCents);
      break;
    case 'newest':
      orderBy = desc(services.createdAt);
      break;
    case 'relevance':
    default:
      orderBy = desc(services.createdAt);
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
      priceInCents: services.priceInCents,
      category: services.category,
      coverImageUrl: services.coverImageUrl,
      createdAt: services.createdAt,
      providerId: services.providerId,
      businessName: providers.businessName,
      handle: providers.handle,
      baseSuburb: providers.baseSuburb,
      baseRegion: providers.baseRegion,
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
      orderBy,
    )
    .limit(limit)
    .offset(offset);

  // TODO: wire real providerStats and responseTimes once review/response data is finalised
  const providerStats: Record<string, { avgRating: number; reviewCount: number }> = {};
  const responseTimes: Record<string, string> = {};

  let servicesWithProviders: ServiceWithProviderAndFavorite[] = servicesData.map((service) => {
    const stats = providerStats[service.providerId] || { avgRating: 0, reviewCount: 0 };
    return {
      id: service.id,
      slug: service.slug,
      title: service.title,
      description: service.description,
      priceInCents: service.priceInCents,
      category: service.category,
      coverImageUrl: service.coverImageUrl,
      createdAt: service.createdAt,
      favoriteCount: Number(service.favoriteCount ?? 0),
      provider: {
        id: service.providerId,
        businessName: service.businessName,
        handle: service.handle,
        baseSuburb: service.baseSuburb,
        baseRegion: service.baseRegion,
        trustScore: service.trustScore,
        isVerified: service.isVerified,
        avatarUrl: service.avatarUrl,
        averageResponseTime: responseTimes[service.providerId] || 'under 2h',
      },
      user: {
        firstName: service.firstName,
        lastName: service.lastName,
      },
      avgRating: stats.avgRating,
      reviewCount: stats.reviewCount,
      isFavorite: service.isFavorite ?? false,
    };
  });

  if (filters.rating != null) {
    servicesWithProviders = servicesWithProviders.filter(
      (service) => service.avgRating >= filters.rating!,
    );
  }

  // TODO: replace mock KPI values with real aggregates once defined
  const kpi = {
    activeServices: totalCount,
    satisfactionRate: 95,
    avgResponseMinutes: 120,
  };

  return {
    filters,
    services: servicesWithProviders,
    totalCount,
    hasMore: page * limit < totalCount,
    kpi,
  };
}

export async function getServicesStats(): Promise<{
  totalServices: number;
  averageRating: number;
}> {
  // Get total approved services
  const totalServicesResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(services)
    .innerJoin(providers, eq(services.providerId, providers.id))
    .where(eq(providers.status, 'approved'));

  const totalServices = totalServicesResult[0]?.count || 0;

  // Get average rating from reviews table
  const ratingResult = await db
    .select({ avgRating: avg(reviews.rating) })
    .from(reviews);

  const averageRating = ratingResult[0]?.avgRating ? Number(ratingResult[0].avgRating) : 0;

  return {
    totalServices,
    averageRating,
  };
}