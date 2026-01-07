import { db } from "@/lib/db";
import { providers, reviews, services, serviceFavorites } from "@/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import { sortServicesByScore } from "@/lib/ranking";
import { isProviderCurrentlySuspended, providerNotCurrentlySuspendedWhere } from "@/lib/suspension";

export type SimilarService = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  pricingType: (typeof services.pricingType.enumValues)[number];
  priceInCents: number | null;
  priceNote: string | null;
  category: (typeof services.category.enumValues)[number];
  coverImageUrl: string | null;
  createdAt: Date;
  providerId: string;
  providerHandle: string | null;
  providerBusinessName: string | null;
  providerTrustScore: number;
  providerVerified: boolean;
  providerRegion: string | null;
  avgRating: number;
  reviewCount: number;
  favoriteCount: number;
};

export async function getSimilarServices(serviceId: string, client = db): Promise<SimilarService[] | null> {
  const now = new Date();
  const baseService = await client.query.services.findFirst({
    where: eq(services.id, serviceId),
    with: {
      provider: {
        columns: { status: true, isSuspended: true, suspensionStartDate: true, suspensionEndDate: true },
      },
    },
    columns: { id: true, category: true, region: true, suburb: true },
  });

  if (!baseService || !baseService.provider) return null;
  if (isProviderCurrentlySuspended(baseService.provider, now) || baseService.provider.status !== "approved") return [];

  const predicates = [
    eq(services.category, baseService.category),
    ne(services.id, baseService.id),
    eq(providers.status, "approved"),
    providerNotCurrentlySuspendedWhere(now),
  ];

  if (baseService.region) {
    predicates.push(eq(services.region, baseService.region));
  }

  if (baseService.suburb) {
    predicates.push(eq(services.suburb, baseService.suburb));
  }

  const rows = await client
    .select({
      id: services.id,
      title: services.title,
      slug: services.slug,
      description: services.description,
      pricingType: services.pricingType,
      priceInCents: services.priceInCents,
      priceNote: services.priceNote,
      category: services.category,
      coverImageUrl: services.coverImageUrl,
      createdAt: services.createdAt,
      providerId: providers.id,
      providerHandle: providers.handle,
      providerBusinessName: providers.businessName,
      providerTrustScore: providers.trustScore,
      providerVerified: providers.isVerified,
      providerRegion: services.region,
      avgRating: sql<number>`COALESCE(AVG(${reviews.rating}) FILTER (WHERE ${reviews.isHidden} = false), 0)`,
      reviewCount: sql<number>`COUNT(${reviews.id}) FILTER (WHERE ${reviews.isHidden} = false)`,
      favoriteCount: sql<number>`COUNT(${serviceFavorites.id})`,
    })
    .from(services)
    .innerJoin(providers, eq(services.providerId, providers.id))
    .leftJoin(reviews, eq(reviews.serviceId, services.id))
    .leftJoin(serviceFavorites, eq(serviceFavorites.serviceId, services.id))
    .where(and(...predicates))
    .groupBy(services.id, providers.id)
    .limit(12);

  const normalizedRows: SimilarService[] = rows.map((item) => ({
    ...item,
    avgRating: Number(item.avgRating ?? 0),
    reviewCount: Number(item.reviewCount ?? 0),
    favoriteCount: Number(item.favoriteCount ?? 0),
    providerTrustScore: item.providerTrustScore ?? 0,
    providerVerified: item.providerVerified ?? false,
  }));

  // Rank using a numeric price fallback, but return original (nullable) prices.
  const rankedIds = sortServicesByScore(
    normalizedRows.map((item) => ({
      ...item,
      priceInCents: item.priceInCents ?? 0,
      trustScore: item.providerTrustScore ?? 0,
    })),
  )
    .slice(0, 6)
    .map((r) => r.id);

  const byId = new Map(normalizedRows.map((r) => [r.id, r] as const));
  return rankedIds.map((id) => byId.get(id)).filter(Boolean) as SimilarService[];
}
