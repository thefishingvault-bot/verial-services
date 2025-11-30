import { db } from '@/lib/db';
import { services, providers, users, conversations, messages, reviews } from '@/db/schema';
import { eq, and, or, like, sql, desc, asc, gte, lte, avg, ne } from 'drizzle-orm';

export type ServiceCategory = "cleaning" | "plumbing" | "gardening" | "it_support" | "accounting" | "detailing" | "other";

export interface SearchParams {
  q?: string;
  category?: ServiceCategory;
  location?: string;
  minPrice?: string;
  maxPrice?: string;
  rating?: string;
  availability?: string;
  trustLevel?: string;
  verifiedOnly?: string;
  distance?: string;
  sort?: string;
  view?: 'grid' | 'map';
  page?: string;
}

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

export async function getServicesData(searchParams: SearchParams): Promise<{
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

  // Build the query based on search parameters
  const whereConditions = [eq(providers.status, 'approved')];

  // Text search
  if (searchParams.q) {
    whereConditions.push(
      or(
        like(services.title, `%${searchParams.q}%`),
        like(services.description, `%${searchParams.q}%`),
        like(providers.businessName, `%${searchParams.q}%`)
      )!
    );
  }

  // Category filter
  if (searchParams.category) {
    whereConditions.push(eq(services.category, searchParams.category));
  }

  // Location filter (simplified - would need geocoding in production)
  if (searchParams.location) {
    whereConditions.push(
      or(
        like(providers.baseSuburb, `%${searchParams.location}%`),
        like(providers.baseRegion, `%${searchParams.location}%`)
      )!
    );
  }

  // Price range filter
  if (searchParams.minPrice) {
    whereConditions.push(gte(services.priceInCents, parseInt(searchParams.minPrice) * 100));
  }
  if (searchParams.maxPrice) {
    whereConditions.push(lte(services.priceInCents, parseInt(searchParams.maxPrice) * 100));
  }

  // Trust level filter
  if (searchParams.trustLevel) {
    const validTrustLevels = ["bronze", "silver", "gold", "platinum"] as const;
    if (validTrustLevels.includes(searchParams.trustLevel as any)) {
      whereConditions.push(
        eq(
          providers.trustLevel,
          searchParams.trustLevel as (typeof validTrustLevels)[number]
        )
      );
    }
  }

  // Verification filter
  if (searchParams.verifiedOnly === 'true') {
    whereConditions.push(eq(providers.isVerified, true));
  }

  // Availability filter (simplified)
  if (searchParams.availability) {
    // Example: 'today', 'tomorrow', 'weekend', 'next_week'
    // This would require a join with providerAvailabilities and/or providerTimeOffs
    // For now, just a placeholder
    // whereConditions.push(...)
  }

  // Distance filter (simplified)
  if (searchParams.distance) {
    // Would require geolocation logic; placeholder for now
    // whereConditions.push(...)
  }

  // Minimum rating filter
  if (searchParams.rating) {
    // Will filter after fetching review stats
  }

  // Build order by
  let orderBy = desc(services.createdAt);
  switch (searchParams.sort) {
    case 'rating':
      orderBy = desc(sql`COALESCE(avg_rating, 0)`);
      break;
    case 'price_low':
      orderBy = asc(services.priceInCents);
      break;
    case 'price_high':
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

  const page = parseInt(searchParams.page || '1');
  const limit = 12; // Show 12 services per page
  const offset = (page - 1) * limit;

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
  if (searchParams.rating) {
    const minRating = parseFloat(searchParams.rating);
    servicesWithProviders = servicesWithProviders.filter(s => s.avgRating >= minRating);
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