import { db } from '@/lib/db';
import { services, providers, users, reviews } from '@/db/schema';
import { eq, and, or, like, sql, desc, asc, gte, lte, avg, inArray } from 'drizzle-orm';

export type ServiceCategory = "cleaning" | "plumbing" | "gardening" | "it_support" | "accounting" | "detailing" | "other";

export interface SearchParams {
  q?: string;
  category?: string;
  location?: string;
  minPrice?: string;
  maxPrice?: string;
  rating?: string;
  availability?: string;
  sort?: string;
  view?: 'grid' | 'map';
  page?: string;
}

  // Deprecated: use ServicesFilterState instead

export type ServicesFilterState = {
  categories: string[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  trustLevels: string[];
  search?: string;
  sort?: string;
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

export async function getServicesData({ filters }: { filters: ServicesFilterState }): Promise<{
  services: ServiceWithProvider[];
  hasMore: boolean;
  totalCount: number;
  filterCounts: {
    categories: Array<{ category: string; count: number }>;
    trustLevels: Array<{ trustLevel: string; count: number }>;
    verified: number;
    availability: Array<{ value: string; count: number }>;
    distance: Array<{ value: number; count: number }>;
  };
}> {

  // Build the query based on filters
  const whereConditions = [eq(providers.status, 'approved')];

  // Text search
  if (filters.search) {
    whereConditions.push(
      or(
        like(services.title, `%${filters.search}%`),
        like(services.description, `%${filters.search}%`),
        like(providers.businessName, `%${filters.search}%`)
      )!
    );
  }

  // Category filter
  if (filters.categories && filters.categories.length > 0) {
    const allowedCategories = ["cleaning", "plumbing", "gardening", "it_support", "accounting", "detailing", "other"] as const;
    const validCategories = filters.categories.filter((cat): cat is (typeof allowedCategories)[number] =>
      (allowedCategories as readonly string[]).includes(cat)
    );
    if (validCategories.length > 0) {
      whereConditions.push(inArray(services.category, validCategories));
    }
  }

  // Price range filter
  if (filters.minPrice != null) {
    whereConditions.push(gte(services.priceInCents, filters.minPrice * 100));
  }
  if (filters.maxPrice != null) {
    whereConditions.push(lte(services.priceInCents, filters.maxPrice * 100));
  }

  // Trust level filter
  if (filters.trustLevels && filters.trustLevels.length > 0) {
    const allowedTrustLevels = ["bronze", "silver", "gold", "platinum"] as const;
    const validTrustLevels = filters.trustLevels.filter((tl): tl is (typeof allowedTrustLevels)[number] =>
      (allowedTrustLevels as readonly string[]).includes(tl)
    );
    if (validTrustLevels.length > 0) {
      whereConditions.push(inArray(providers.trustLevel, validTrustLevels));
    }
  }

  // Minimum rating filter (will filter after fetching review stats)

  // Build order by
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

  // Get total count for pagination
  const totalCountResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(services)
    .innerJoin(providers, eq(services.providerId, providers.id))
    .innerJoin(users, eq(providers.userId, users.id))
    .where(and(...whereConditions));

  const totalCount = totalCountResult[0]?.count || 0;

  // Aggregation queries for filter counts
  // Category counts
  const categoryCounts = await db
    .select({ category: services.category, count: sql<number>`count(*)` })
    .from(services)
    .innerJoin(providers, eq(services.providerId, providers.id))
    .where(eq(providers.status, 'approved'))
    .groupBy(services.category);

  // Trust level counts
  const trustLevelCounts = await db
    .select({ trustLevel: providers.trustLevel, count: sql<number>`count(*)` })
    .from(providers)
    .where(eq(providers.status, 'approved'))
    .groupBy(providers.trustLevel);

  // Verification counts
  const verifiedCountResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(providers)
    .where(and(eq(providers.status, 'approved'), eq(providers.isVerified, true)));
  const verifiedCount = verifiedCountResult[0]?.count || 0;

  // Availability counts (placeholder)
  // Would require join with providerAvailabilities/providerTimeOffs
  const availabilityCounts = [
    { value: 'today', count: 0 },
    { value: 'tomorrow', count: 0 },
    { value: 'weekend', count: 0 },
    { value: 'next_week', count: 0 },
  ];

  // Distance counts (placeholder)
  // Would require geolocation logic
  const distanceCounts = [
    { value: 25, count: totalCount },
  ];

  // Fetch services with provider info
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

  // ...existing code for response times...

  // ...existing code for review stats...

  // Transform data with real ratings and review counts
  // Placeholder for providerStats and responseTimes
  const providerStats: Record<string, { avgRating: number; reviewCount: number }> = {};
  const responseTimes: Record<string, string> = {};
  let servicesWithProviders: ServiceWithProvider[] = servicesData.map(service => {
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
        trustLevel: service.trustLevel,
        isVerified: service.isVerified,
        avatarUrl: service.avatarUrl,
        averageResponseTime: responseTimes[service.providerId] || 'under 2h', // fallback
      },
      user: {
        firstName: service.firstName,
        lastName: service.lastName,
      },
      avgRating: stats.avgRating,
      reviewCount: stats.reviewCount,
    };
  });

  // Apply minimum rating filter after stats
  if (filters.minRating != null) {
    servicesWithProviders = servicesWithProviders.filter(s => s.avgRating >= filters.minRating!);
  }

  return {
    services: servicesWithProviders,
    hasMore: servicesWithProviders.length === limit && (page * limit) < totalCount,
    totalCount,
    filterCounts: {
      categories: categoryCounts,
      trustLevels: trustLevelCounts,
      verified: verifiedCount,
      availability: availabilityCounts,
      distance: distanceCounts,
    },
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