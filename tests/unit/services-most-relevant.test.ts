import { describe, expect, it } from "vitest";
import { compareMostRelevant, getPlanBoostPoints, type MostRelevantComparable } from "@/lib/services-most-relevant";

function s(params: {
  id: string;
  baseScore: number;
  plan: "starter" | "pro" | "elite" | "unknown";
  stripeSubscriptionStatus: string | null;
  isVerified: boolean;
}): MostRelevantComparable {
  return {
    id: params.id,
    baseScore: params.baseScore,
    plan: params.plan,
    stripeSubscriptionStatus: params.stripeSubscriptionStatus,
    isVerified: params.isVerified,
  };
}

describe("Most relevant ordering", () => {
  it("Case 1: threshold behavior (Elite > Pro > Starter)", () => {
    const starter = s({ id: "starter", baseScore: 100, plan: "starter", stripeSubscriptionStatus: null, isVerified: true });
    const pro = s({ id: "pro", baseScore: 90, plan: "pro", stripeSubscriptionStatus: "active", isVerified: true });
    const elite = s({ id: "elite", baseScore: 80, plan: "elite", stripeSubscriptionStatus: "active", isVerified: true });

    const sorted = [starter, elite, pro].sort(compareMostRelevant);
    expect(sorted.map((x) => x.id)).toEqual(["elite", "pro", "starter"]);
  });

  it("Case 2: baseScore dominance (Starter beats Elite)", () => {
    const starter = s({ id: "starter", baseScore: 200, plan: "starter", stripeSubscriptionStatus: null, isVerified: true });
    const elite = s({ id: "elite", baseScore: 100, plan: "elite", stripeSubscriptionStatus: "active", isVerified: true });

    const sorted = [elite, starter].sort(compareMostRelevant);
    expect(sorted[0]?.id).toBe("starter");
  });

  it("gating: boost only for active/trialing + recognized plan + verified", () => {
    expect(getPlanBoostPoints({ plan: "pro", stripeSubscriptionStatus: "active", isVerified: true })).toBe(15);
    expect(getPlanBoostPoints({ plan: "elite", stripeSubscriptionStatus: "trialing", isVerified: true })).toBe(30);

    expect(getPlanBoostPoints({ plan: "pro", stripeSubscriptionStatus: "canceled", isVerified: true })).toBe(0);
    expect(getPlanBoostPoints({ plan: "unknown", stripeSubscriptionStatus: "active", isVerified: true })).toBe(0);
    expect(getPlanBoostPoints({ plan: "elite", stripeSubscriptionStatus: "active", isVerified: false })).toBe(0);
  });
});
