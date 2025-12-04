import { db } from '@/lib/db';
import { services, providers, users, reviews } from '@/db/schema';
import { eq, and, or, like, sql, desc, asc, gte, lte, avg } from 'drizzle-orm';

export type ServicesSearchParams = Record<string, string | string[] | undefined>;

export type ServicesFilters = {
  q: string;
  category: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  rating: number | null;
  sort: 'relevance' | 'price_asc' | 'price_desc' | 'rating_desc' | 'newest';
};

export interface ServiceWithProvider {
  id: string;
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
  distance?: number;
}
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

  const minPriceRaw = getSingle('minPrice');
  const maxPriceRaw = getSingle('maxPrice');
  const ratingRaw = getSingle('rating');
  const sortRaw = getSingle('sort');

  const toNumber = (value?: string | null): number | null => {
    if (!value) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const minPrice = toNumber(minPriceRaw);
  const maxPrice = toNumber(maxPriceRaw);
  const rating = toNumber(ratingRaw);

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
    minPrice,
    maxPrice,
    rating,
    sort,
  };
}

export type ServicesDataResult = {
  filters: ServicesFilters;
  services: ServiceWithProvider[];
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

  const page = 1; // TODO: wire up pagination if needed
  const limit = 12;
  const offset = 0;

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
    })
    .from(services)
    .innerJoin(providers, eq(services.providerId, providers.id))
    .innerJoin(users, eq(providers.userId, users.id))
    .where(and(...whereConditions))
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  // TODO: wire real providerStats and responseTimes once review/response data is finalised
  const providerStats: Record<string, { avgRating: number; reviewCount: number }> = {};
  const responseTimes: Record<string, string> = {};

  let servicesWithProviders: ServiceWithProvider[] = servicesData.map((service) => {
    const stats = providerStats[service.providerId] || { avgRating: 0, reviewCount: 0 };
    return {
      id: service.id,
      title: service.title,
      description: service.description,
      priceInCents: service.priceInCents,
      category: service.category,
      coverImageUrl: service.coverImageUrl,
      createdAt: service.createdAt,
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
    hasMore: servicesWithProviders.length === limit && page * limit < totalCount,
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