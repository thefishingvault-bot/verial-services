import { db } from '@/lib/db';
import { services, providers, users } from '@/db/schema';
import { eq, and, or, like, sql, desc, asc, gte, lte } from 'drizzle-orm';

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
    whereConditions.push(eq(services.category, searchParams.category as any));
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

  // Build order by
  let orderBy = desc(services.createdAt);
  switch (searchParams.sort) {
    case 'rating':
      // This would need a proper join with reviews table
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

  // Transform data and add mock ratings (in production, this would come from reviews table)
  const servicesWithProviders: ServiceWithProvider[] = servicesData.map(service => ({
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
    },
    user: {
      firstName: service.firstName,
      lastName: service.lastName,
    },
    avgRating: Math.random() * 2 + 3, // Mock rating between 3-5
    reviewCount: Math.floor(Math.random() * 50) + 1, // Mock review count
  }));

  return {
    services: servicesWithProviders,
    hasMore: servicesWithProviders.length === limit && (page * limit) < totalCount,
    totalCount,
  };
}