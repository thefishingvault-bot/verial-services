import { services, providers } from "@/db/schema";
import { desc, asc, sql, type SQL } from "drizzle-orm";

export type PublicPlanBadge = "pro" | "elite";

export type ProviderPlan = "starter" | "pro" | "elite" | "unknown";

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

export function getPlanRank(params: {
  plan: unknown;
  stripeSubscriptionStatus: unknown;
}): number {
  const plan = typeof params.plan === "string" ? params.plan : null;
  const status = typeof params.stripeSubscriptionStatus === "string" ? params.stripeSubscriptionStatus : null;
  const isSubscribed = status === "active" || status === "trialing";
  if (!isSubscribed) return 0;

  if (plan === "elite") return 2;
  if (plan === "pro") return 1;
  return 0;
}

export function buildMostRelevantScoring(params: {
  q?: string | null;
  avgRatingExpr: SQL<number>;
  reviewCountExpr: SQL<number>;
  favoriteCountExpr: SQL<number>;
}): {
  planRankExpr: SQL<number>;
  baseScoreExpr: SQL<number>;
  orderBy: SQL[];
} {
  const q = params.q?.trim() ? params.q.trim() : null;

  // Base score: keep signals in a small-ish range so plan boosts (15/30) are meaningful
  // without overpowering relevance.
  const textPointsExpr = q
    ? sql<number>`(
        CASE
          WHEN LOWER(${services.title}) LIKE ${toLikeNeedle(q)} THEN 60
          WHEN LOWER(COALESCE(${services.description}, '')) LIKE ${toLikeNeedle(q)} THEN 40
          WHEN LOWER(COALESCE(${providers.businessName}, '')) LIKE ${toLikeNeedle(q)} THEN 20
          WHEN LOWER(COALESCE(${providers.handle}, '')) LIKE ${toLikeNeedle(q)} THEN 20
          ELSE 0
        END
      )`
    : sql<number>`0`;

  const verifiedPointsExpr = sql<number>`(CASE WHEN ${providers.isVerified} THEN 10 ELSE 0 END)`;

  // Rating 0..5 -> 0..50
  const ratingPointsExpr = sql<number>`(${params.avgRatingExpr} * 10)`;

  // Review count uses log scaling to avoid domination by outliers.
  const reviewPointsExpr = sql<number>`(LN(${params.reviewCountExpr} + 1) * 10)`;

  // Trust score is repo-defined; scale down to keep in-band.
  const trustPointsExpr = sql<number>`(COALESCE(${providers.trustScore}, 0) * 0.4)`;

  // Favorites as a soft signal.
  const favoritesPointsExpr = sql<number>`(LN(${params.favoriteCountExpr} + 1) * 5)`;

  const baseScoreExpr = sql<number>`(
    ${textPointsExpr}
    + ${verifiedPointsExpr}
    + ${ratingPointsExpr}
    + ${reviewPointsExpr}
    + ${trustPointsExpr}
    + ${favoritesPointsExpr}
  )`;

  // Plan rank: PRIMARY sort key for Most Relevant.
  // Derived from the same inputs as badges (plan + subscription status).
  const planRankExpr = sql<number>`(
    CASE
      WHEN ${providers.stripeSubscriptionStatus} IN ('active', 'trialing') AND ${providers.plan} = 'elite' THEN 2
      WHEN ${providers.stripeSubscriptionStatus} IN ('active', 'trialing') AND ${providers.plan} = 'pro' THEN 1
      ELSE 0
    END
  )`;

  // Deterministic ordering:
  // 1) paid tier priority (Elite > Pro > Starter)
  // 2) existing relevance ordering within the same tier
  // 3) stable tiebreakers
  const orderBy: SQL[] = [
    desc(planRankExpr),
    desc(baseScoreExpr),
    desc(services.createdAt),
    asc(services.id),
  ];

  return { planRankExpr, baseScoreExpr, orderBy };
}

export function buildMostRelevantOrderBy(params: {
  q?: string | null;
  avgRatingExpr: SQL<number>;
  reviewCountExpr: SQL<number>;
  favoriteCountExpr: SQL<number>;
}): SQL[] {
  return buildMostRelevantScoring(params).orderBy;
}

export type MostRelevantComparable = {
  id: string;
  relevanceScore: number;
  plan: ProviderPlan;
  stripeSubscriptionStatus: string | null;
};

export function compareMostRelevant(a: MostRelevantComparable, b: MostRelevantComparable): number {
  const aRank = getPlanRank({
    plan: a.plan,
    stripeSubscriptionStatus: a.stripeSubscriptionStatus,
  });
  const bRank = getPlanRank({
    plan: b.plan,
    stripeSubscriptionStatus: b.stripeSubscriptionStatus,
  });

  const cmpDesc = (x: number, y: number) => (x === y ? 0 : x > y ? -1 : 1);

  return (
    cmpDesc(aRank, bRank) ||
    cmpDesc(a.relevanceScore, b.relevanceScore) ||
    a.id.localeCompare(b.id)
  );
}
