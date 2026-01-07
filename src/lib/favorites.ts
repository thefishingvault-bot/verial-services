import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { serviceFavorites, services, providers, reviews } from "@/db/schema";
import { scoreService, type RankableService } from "@/lib/ranking";
import { providerNotCurrentlySuspendedWhere } from "@/lib/suspension";

export type FavoriteSort = "recent" | "top";

export type FavoriteService = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  pricingType: (typeof services.pricingType.enumValues)[number];
  priceInCents: number | null;
  priceNote: string | null;
  chargesGst: boolean;
  coverImageUrl: string | null;
  createdAt: Date;
  favoritedAt: Date;
  avgRating: number;
  reviewCount: number;
  favoriteCount: number;
  provider: {
    id: string;
    handle: string | null;
    businessName: string | null;
    trustLevel: (typeof providers.trustLevel.enumValues)[number];
    trustScore: number;
    isVerified: boolean;
    region: string | null;
    suburb: string | null;
  };
  isFavorited: true;
  score: number;
};

export async function getUserFavoriteServices(userId: string, sort: FavoriteSort = "recent", client = db) {
  const now = new Date();
  const rows = await client
    .select({
      id: services.id,
      slug: services.slug,
      title: services.title,
      description: services.description,
      category: services.category,
      pricingType: services.pricingType,
      priceInCents: services.priceInCents,
      priceNote: services.priceNote,
      chargesGst: services.chargesGst,
      coverImageUrl: services.coverImageUrl,
      createdAt: services.createdAt,
      favoritedAt: serviceFavorites.createdAt,
      providerId: providers.id,
      providerHandle: providers.handle,
      providerBusinessName: providers.businessName,
      providerTrustLevel: providers.trustLevel,
      providerTrustScore: providers.trustScore,
      providerVerified: providers.isVerified,
      providerRegion: services.region,
      providerSuburb: services.suburb,
      avgRating: sql<number>`COALESCE(AVG(${reviews.rating}) FILTER (WHERE ${reviews.isHidden} = false), 0)`,
      reviewCount: sql<number>`COUNT(${reviews.id}) FILTER (WHERE ${reviews.isHidden} = false)`,
      favoriteCount: sql<number>`(
        SELECT COUNT(*) FROM ${serviceFavorites} sf_all WHERE sf_all.service_id = ${services.id}
      )`,
    })
    .from(serviceFavorites)
    .innerJoin(services, eq(serviceFavorites.serviceId, services.id))
    .innerJoin(providers, eq(services.providerId, providers.id))
    .leftJoin(reviews, eq(reviews.serviceId, services.id))
    .where(
      and(
        eq(serviceFavorites.userId, userId),
        eq(providers.status, "approved"),
        providerNotCurrentlySuspendedWhere(now),
      ),
    )
    .groupBy(
      services.id,
      providers.id,
      serviceFavorites.createdAt,
    );

  const mapped: FavoriteService[] = rows.map((row) => {
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
      isFavoritedByUser: true,
    };

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      category: row.category,
      pricingType: row.pricingType,
      priceInCents: row.priceInCents,
      priceNote: row.priceNote,
      chargesGst: row.chargesGst,
      coverImageUrl: row.coverImageUrl,
      createdAt: row.createdAt,
      favoritedAt: row.favoritedAt,
      avgRating,
      reviewCount,
      favoriteCount,
      provider: {
        id: row.providerId,
        handle: row.providerHandle,
        businessName: row.providerBusinessName,
        trustLevel: row.providerTrustLevel,
        trustScore: row.providerTrustScore ?? 0,
        isVerified: row.providerVerified ?? false,
        region: row.providerRegion,
        suburb: row.providerSuburb,
      },
      isFavorited: true,
      score: scoreService(rankable),
    };
  });

  const sorted = [...mapped].sort((a, b) => {
    if (sort === "top") {
      if (b.score !== a.score) return b.score - a.score;
      return b.favoritedAt.getTime() - a.favoritedAt.getTime();
    }

    // default recent
    const recentDiff = b.favoritedAt.getTime() - a.favoritedAt.getTime();
    if (recentDiff !== 0) return recentDiff;
    if (b.score !== a.score) return b.score - a.score;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return sorted;
}
