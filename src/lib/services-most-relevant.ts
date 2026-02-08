import { services, providers } from "@/db/schema";
import { desc, asc, sql, type SQL } from "drizzle-orm";

export type PublicPlanBadge = "pro" | "elite";

export function getPublicPlanBadge(params: {
  plan: unknown;
  stripeSubscriptionStatus: unknown;
}): PublicPlanBadge | null {
  const plan = typeof params.plan === "string" ? params.plan : null;
  const status = typeof params.stripeSubscriptionStatus === "string" ? params.stripeSubscriptionStatus : null;

  const isActive = status === "active" || status === "trialing";
  if (!isActive) return null;

  if (plan === "elite") return "elite";
  if (plan === "pro") return "pro";
  return null;
}

function toLikeNeedle(q: string) {
  return `%${q.toLowerCase()}%`;
}

export function buildMostRelevantOrderBy(params: {
  q?: string | null;
  avgRatingExpr: SQL<number>;
  reviewCountExpr: SQL<number>;
  favoriteCountExpr: SQL<number>;
}): SQL[] {
  const q = params.q?.trim() ? params.q.trim() : null;

  // Text match priority is only used when q is present. It keeps the primary signal as text relevance,
  // then uses quality signals (rating/reviews/trust/verified), and only then plan rank as a modest tie-break.
  const textMatchScore = q
    ? sql<number>`(
        CASE
          WHEN LOWER(${services.title}) LIKE ${toLikeNeedle(q)} THEN 3
          WHEN LOWER(COALESCE(${services.description}, '')) LIKE ${toLikeNeedle(q)} THEN 2
          WHEN LOWER(COALESCE(${providers.businessName}, '')) LIKE ${toLikeNeedle(q)} THEN 1
          WHEN LOWER(COALESCE(${providers.handle}, '')) LIKE ${toLikeNeedle(q)} THEN 1
          ELSE 0
        END
      )`
    : sql<number>`0`;

  // Only boost active, recognized plans (not starter/unknown/canceled).
  const planRank = sql<number>`(
      CASE
        WHEN ${providers.stripeSubscriptionStatus} IN ('active', 'trialing') AND ${providers.plan} = 'elite' THEN 2
        WHEN ${providers.stripeSubscriptionStatus} IN ('active', 'trialing') AND ${providers.plan} = 'pro' THEN 1
        ELSE 0
      END
    )`;

  return [
    desc(textMatchScore),
    desc(params.avgRatingExpr),
    desc(params.reviewCountExpr),
    desc(providers.isVerified),
    desc(providers.trustScore),
    desc(params.favoriteCountExpr),
    desc(planRank),
    desc(services.createdAt),
    asc(services.id),
  ];
}

export type MostRelevantComparable = {
  id: string;
  title: string;
  description?: string | null;
  providerBusinessName?: string | null;
  providerHandle?: string | null;
  avgRating: number;
  reviewCount: number;
  trustScore: number;
  isVerified: boolean;
  favoriteCount: number;
  createdAt: Date;
  planBadge: PublicPlanBadge | null;
};

export function compareMostRelevant(
  a: MostRelevantComparable,
  b: MostRelevantComparable,
  q?: string | null,
): number {
  const needle = q?.trim() ? q.trim().toLowerCase() : null;

  const textScore = (s: MostRelevantComparable) => {
    if (!needle) return 0;
    const title = s.title.toLowerCase();
    const descText = (s.description ?? "").toLowerCase();
    const biz = (s.providerBusinessName ?? "").toLowerCase();
    const handle = (s.providerHandle ?? "").toLowerCase();

    if (title.includes(needle)) return 3;
    if (descText.includes(needle)) return 2;
    if (biz.includes(needle) || handle.includes(needle)) return 1;
    return 0;
  };

  const planRank = (s: MostRelevantComparable) => (s.planBadge === "elite" ? 2 : s.planBadge === "pro" ? 1 : 0);

  const cmpDesc = (x: number, y: number) => (x === y ? 0 : x > y ? -1 : 1);
  const cmpBoolDesc = (x: boolean, y: boolean) => cmpDesc(Number(x), Number(y));

  return (
    cmpDesc(textScore(a), textScore(b)) ||
    cmpDesc(a.avgRating, b.avgRating) ||
    cmpDesc(a.reviewCount, b.reviewCount) ||
    cmpBoolDesc(a.isVerified, b.isVerified) ||
    cmpDesc(a.trustScore, b.trustScore) ||
    cmpDesc(a.favoriteCount, b.favoriteCount) ||
    cmpDesc(planRank(a), planRank(b)) ||
    cmpDesc(a.createdAt.getTime(), b.createdAt.getTime()) ||
    a.id.localeCompare(b.id)
  );
}
