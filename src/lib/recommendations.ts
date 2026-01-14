import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { bookings, providers, reviews, serviceFavorites, services } from "@/db/schema";
import { db } from "@/lib/db";
import { FAVORITE_BOOST, scoreService, type RankableService } from "@/lib/ranking";
import { normalizeProviderPlan } from "@/lib/provider-subscription";
import { providerNotCurrentlySuspendedWhere } from "@/lib/suspension";

type ServiceCategory = (typeof services.$inferSelect)["category"];

export type RecommendationCardData = {
  serviceId: string;
  slug: string;
  title: string;
  description: string | null;
  pricingType: (typeof services.pricingType.enumValues)[number];
  priceInCents: number | null;
  priceNote: string | null;
  category: ServiceCategory;
  coverImageUrl: string | null;
  provider: {
    id: string;
    name: string | null;
    handle: string | null;
    trustLevel: (typeof providers.trustLevel.enumValues)[number];
    trustScore: number;
    isVerified: boolean;
  };
  score: number;
  reason?: string;
};

type EngagementSignals = {
  favoriteServiceIds: Set<string>;
  favoriteCategories: Set<ServiceCategory>;
  bookingCategories: Set<ServiceCategory>;
  bookedProviders: Set<string>;
};

async function getEngagementSignals(userId: string): Promise<EngagementSignals> {
  const [favoriteRows, bookingRows] = await Promise.all([
    db
      .select({ serviceId: serviceFavorites.serviceId, category: services.category })
      .from(serviceFavorites)
      .innerJoin(services, eq(serviceFavorites.serviceId, services.id))
      .where(eq(serviceFavorites.userId, userId)),
    db
      .select({ providerId: bookings.providerId, category: services.category })
      .from(bookings)
      .innerJoin(services, eq(bookings.serviceId, services.id))
      .where(eq(bookings.userId, userId)),
  ]);

  const favoriteServiceIds = new Set<string>();
  const favoriteCategories = new Set<ServiceCategory>();
  favoriteRows.forEach((row) => {
    favoriteServiceIds.add(row.serviceId);
    favoriteCategories.add(row.category);
  });

  const bookingCategories = new Set<ServiceCategory>();
  const bookedProviders = new Set<string>();
  bookingRows.forEach((row) => {
    bookingCategories.add(row.category);
    bookedProviders.add(row.providerId);
  });

  return { favoriteServiceIds, favoriteCategories, bookingCategories, bookedProviders };
}

function buildReason(opts: {
  favoriteCategories: Set<ServiceCategory>;
  bookingCategories: Set<ServiceCategory>;
  bookedProviders: Set<string>;
  category: ServiceCategory;
  providerId: string;
}) {
  if (opts.favoriteCategories.has(opts.category)) return "Because you like this category";
  if (opts.bookingCategories.has(opts.category)) return "Similar to what you've booked";
  if (opts.bookedProviders.has(opts.providerId)) return "Similar to providers you've booked";
  return undefined;
}

export async function getRecommendedServicesForUser(userId: string, limit = 6): Promise<RecommendationCardData[]> {
  const now = new Date();
  const { favoriteServiceIds, favoriteCategories, bookingCategories, bookedProviders } = await getEngagementSignals(userId);

  const preferredCategories = Array.from(new Set([...favoriteCategories, ...bookingCategories]));

  // Primary candidate pool respects provider approval/suspension and optional category narrowing.
  const candidates = await db
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
      providerId: providers.id,
      providerName: providers.businessName,
      providerHandle: providers.handle,
      providerTrustLevel: providers.trustLevel,
      providerTrustScore: providers.trustScore,
      providerVerified: providers.isVerified,
      providerPlan: providers.plan,
      avgRating: sql<number>`COALESCE(AVG(${reviews.rating}) FILTER (WHERE ${reviews.isHidden} = false), 0)`,
      reviewCount: sql<number>`COUNT(${reviews.id}) FILTER (WHERE ${reviews.isHidden} = false)`,
      favoriteCount: sql<number>`(
        SELECT COUNT(*) FROM ${serviceFavorites} sf_all WHERE sf_all.service_id = ${services.id}
      )`,
    })
    .from(services)
    .innerJoin(providers, eq(services.providerId, providers.id))
    .leftJoin(reviews, eq(reviews.serviceId, services.id))
    .where(
      and(
        eq(providers.status, "approved"),
        providerNotCurrentlySuspendedWhere(now),
        preferredCategories.length > 0
          ? inArray(services.category, preferredCategories)
          : sql`1=1`,
      ),
    )
    .groupBy(services.id, providers.id)
    .orderBy(desc(services.createdAt))
    .limit(80);

  const scored = candidates
    // Exclude favorites from recommendations to avoid redundancy on dashboard.
    .filter((row) => !favoriteServiceIds.has(row.id))
    .map((row) => {
      const avgRating = Number(row.avgRating ?? 0);
      const reviewCount = Number(row.reviewCount ?? 0);
      const favoriteCount = Number(row.favoriteCount ?? 0);

      const rankable: RankableService = {
        id: row.id,
        priceInCents: row.priceInCents ?? 0,
        avgRating,
        reviewCount,
        trustScore: row.providerTrustScore ?? 0,
        createdAt: row.createdAt,
        isVerified: row.providerVerified ?? false,
        favoriteCount,
        isFavoritedByUser: favoriteServiceIds.has(row.id),
        providerPlan: normalizeProviderPlan(row.providerPlan),
      };

      const baseScore = scoreService(rankable);

      // Personalization boosts are deterministic and additive.
      let personalization = 0;
      if (favoriteCategories.has(row.category)) personalization += 1.5;
      if (bookingCategories.has(row.category)) personalization += 1.1;
      if (bookedProviders.has(row.providerId)) personalization += 0.8;
      if (rankable.isFavoritedByUser) personalization += FAVORITE_BOOST / 2;

      const score = baseScore + personalization;

      return {
        serviceId: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        pricingType: row.pricingType,
        priceInCents: row.priceInCents,
        priceNote: row.priceNote,
        category: row.category,
        coverImageUrl: row.coverImageUrl,
        provider: {
          id: row.providerId,
          name: row.providerName,
          handle: row.providerHandle,
          trustLevel: row.providerTrustLevel,
          trustScore: row.providerTrustScore ?? 0,
          isVerified: row.providerVerified ?? false,
        },
        score,
        reason: buildReason({
          favoriteCategories,
          bookingCategories,
          bookedProviders,
          category: row.category,
          providerId: row.providerId,
        }),
      } as RecommendationCardData;
    })
    // Sort deterministically: score desc, then slug, then id.
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const slugCompare = a.slug.localeCompare(b.slug);
      if (slugCompare !== 0) return slugCompare;
      return a.serviceId.localeCompare(b.serviceId);
    })
    .slice(0, limit);

  return scored;
}

export async function getDashboardRecommendations(userId: string): Promise<RecommendationCardData[]> {
  return getRecommendedServicesForUser(userId, 6);
}