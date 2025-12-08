import { differenceInDays } from "date-fns";

export type RankableService = {
  id: string;
  priceInCents: number;
  avgRating: number;
  reviewCount: number;
  trustScore: number;
  createdAt: Date;
  isVerified?: boolean;
  favoriteCount?: number;
  isFavoritedByUser?: boolean;
};

export const FAVORITE_BOOST = 0.75;

/**
 * Deterministic ranking score for services.
 * Higher score means more relevant.
 */
export function scoreService(service: RankableService): number {
  const ratingScore = service.avgRating * 12; // up to 60
  const reviewWeight = Math.log10(Math.max(service.reviewCount, 1) + 1) * 10; // dampen low-review noise
  const trustScore = Math.min(Math.max(service.trustScore, 0), 100) * 0.2; // up to 20
  const verifyBonus = service.isVerified ? 5 : 0;
  const recencyPenalty = Math.min(differenceInDays(new Date(), new Date(service.createdAt)), 365);
  const recencyScore = Math.max(0, 20 - recencyPenalty * 0.05); // decay ~0.05/day after launch
  const favorites = service.favoriteCount ? Math.log10(service.favoriteCount + 1) * 4 : 0;
  const favoriteBoost = service.isFavoritedByUser ? FAVORITE_BOOST : 0;

  return ratingScore + reviewWeight + trustScore + verifyBonus + recencyScore + favorites + favoriteBoost;
}

export function sortServicesByScore<T extends RankableService>(items: T[]): T[] {
  return [...items].sort((a, b) => scoreService(b) - scoreService(a));
}
