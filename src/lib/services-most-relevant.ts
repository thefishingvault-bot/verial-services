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

export function getPlanBoostPoints(params: {
  plan: unknown;
  stripeSubscriptionStatus: unknown;
  isVerified: unknown;
}): number {
  const isVerified = params.isVerified === true;
  if (!isVerified) return 0;

  const plan = typeof params.plan === "string" ? params.plan : null;
  const status = typeof params.stripeSubscriptionStatus === "string" ? params.stripeSubscriptionStatus : null;
  const isSubscribed = status === "active" || status === "trialing";
  if (!isSubscribed) return 0;

  if (plan === "elite") return 30;
  if (plan === "pro") return 15;
  return 0;
}

export function buildMostRelevantScoring(params: {
  q?: string | null;
  avgRatingExpr: SQL<number>;
  reviewCountExpr: SQL<number>;
  favoriteCountExpr: SQL<number>;
}): {
  baseScoreExpr: SQL<number>;
  planBoostPointsExpr: SQL<number>;
  finalScoreExpr: SQL<number>;
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

  // Plan boost: only for active/trialing + recognized plan + verified provider.
  const planBoostPointsExpr = sql<number>`(
    CASE
      WHEN ${providers.isVerified} AND ${providers.stripeSubscriptionStatus} IN ('active', 'trialing') AND ${providers.plan} = 'elite' THEN 30
      WHEN ${providers.isVerified} AND ${providers.stripeSubscriptionStatus} IN ('active', 'trialing') AND ${providers.plan} = 'pro' THEN 15
      ELSE 0
    END
  )`;

  const finalScoreExpr = sql<number>`(${baseScoreExpr} + ${planBoostPointsExpr})`;

  // Deterministic ordering; plan boost breaks ties when final scores match.
  const orderBy: SQL[] = [
    desc(finalScoreExpr),
    desc(planBoostPointsExpr),
    desc(baseScoreExpr),
    desc(services.createdAt),
    asc(services.id),
  ];

  return { baseScoreExpr, planBoostPointsExpr, finalScoreExpr, orderBy };
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
  baseScore: number;
  plan: ProviderPlan;
  stripeSubscriptionStatus: string | null;
  isVerified: boolean;
};

export function compareMostRelevant(a: MostRelevantComparable, b: MostRelevantComparable): number {
  const aBoost = getPlanBoostPoints({
    plan: a.plan,
    stripeSubscriptionStatus: a.stripeSubscriptionStatus,
    isVerified: a.isVerified,
  });
  const bBoost = getPlanBoostPoints({
    plan: b.plan,
    stripeSubscriptionStatus: b.stripeSubscriptionStatus,
    isVerified: b.isVerified,
  });

  const aFinal = a.baseScore + aBoost;
  const bFinal = b.baseScore + bBoost;

  const cmpDesc = (x: number, y: number) => (x === y ? 0 : x > y ? -1 : 1);

  return (
    cmpDesc(aFinal, bFinal) ||
    cmpDesc(aBoost, bBoost) ||
    cmpDesc(a.baseScore, b.baseScore) ||
    a.id.localeCompare(b.id)
  );
}
