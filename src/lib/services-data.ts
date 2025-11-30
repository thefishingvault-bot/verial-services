import { db } from '@/lib/db';
import { services, providers, users, conversations, messages, reviews } from '@/db/schema';
import { eq, and, or, like, sql, desc, asc, gte, lte, avg, ne } from 'drizzle-orm';

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

  // Get average response times for each provider
  const providerIds = servicesData.map(service => service.providerId);
  const responseTimes: Record<string, string> = {};

  if (providerIds.length > 0) {
    // For each provider, calculate average response time
    for (const providerId of providerIds) {
      // Get all conversations for this provider
      const providerConversations = await db
        .select({
          conversationId: conversations.id,
          user1Id: conversations.user1Id,
          user2Id: conversations.user2Id,
        })
        .from(conversations)
        .where(or(
          eq(conversations.user1Id, providerId),
          eq(conversations.user2Id, providerId)
        ));

      if (providerConversations.length === 0) {
        responseTimes[providerId] = 'under 2h'; // fallback
        continue;
      }

      let totalResponseTime = 0;
      let responseCount = 0;

      for (const conv of providerConversations) {
        // Find the first message in this conversation (from customer)
        const firstMessage = await db
          .select({ createdAt: messages.createdAt })
          .from(messages)
          .where(and(
            eq(messages.conversationId, conv.conversationId),
            ne(messages.senderId, providerId) // Not from provider
          ))
          .orderBy(asc(messages.createdAt))
          .limit(1);

        if (firstMessage.length === 0) continue;

        // Find the first response from provider after the first message
        const firstResponse = await db
          .select({ createdAt: messages.createdAt })
          .from(messages)
          .where(and(
            eq(messages.conversationId, conv.conversationId),
            eq(messages.senderId, providerId), // From provider
            gte(messages.createdAt, firstMessage[0].createdAt)
          ))
          .orderBy(asc(messages.createdAt))
          .limit(1);

        if (firstResponse.length > 0) {
          const responseTime = firstResponse[0].createdAt.getTime() - firstMessage[0].createdAt.getTime();
          if (responseTime > 0 && responseTime < 7 * 24 * 60 * 60 * 1000) { // Less than 7 days
            totalResponseTime += responseTime;
            responseCount++;
          }
        }
      }

      if (responseCount > 0) {
        const avgResponseMs = totalResponseTime / responseCount;
        const avgResponseHours = avgResponseMs / (1000 * 60 * 60);
        
        if (avgResponseHours < 1) {
          const minutes = Math.round(avgResponseHours * 60);
          responseTimes[providerId] = `under ${Math.max(1, minutes)}m`;
        } else if (avgResponseHours < 24) {
          const hours = Math.floor(avgResponseHours);
          const minutes = Math.round((avgResponseHours - hours) * 60);
          responseTimes[providerId] = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
        } else {
          const days = Math.floor(avgResponseHours / 24);
          responseTimes[providerId] = `${days}d`;
        }
      } else {
        responseTimes[providerId] = 'under 2h'; // fallback
      }
    }
  }

  // Get real ratings and review counts for each provider
  const providerStats: Record<string, { avgRating: number; reviewCount: number }> = {};

  if (providerIds.length > 0) {
    // Get review stats for each provider
    const reviewStats = await db
      .select({
        providerId: reviews.providerId,
        avgRating: avg(reviews.rating),
        reviewCount: sql<number>`count(*)`,
      })
      .from(reviews)
      .where(sql`${reviews.providerId} IN (${sql.join(providerIds, sql`, `)})`)
      .groupBy(reviews.providerId);

    // Convert to a lookup object
    reviewStats.forEach(stat => {
      providerStats[stat.providerId] = {
        avgRating: Number(stat.avgRating) || 0,
        reviewCount: stat.reviewCount,
      };
    });
  }

  // Transform data with real ratings and review counts
  const servicesWithProviders: ServiceWithProvider[] = servicesData.map(service => {
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

  return {
    services: servicesWithProviders,
    hasMore: servicesWithProviders.length === limit && (page * limit) < totalCount,
    totalCount,
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