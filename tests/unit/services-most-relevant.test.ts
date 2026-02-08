import { describe, expect, it } from "vitest";
import { compareMostRelevant, getPlanRank, type MostRelevantComparable } from "@/lib/services-most-relevant";

function s(params: {
  id: string;
  relevanceScore: number;
  plan: "starter" | "pro" | "elite" | "unknown";
  stripeSubscriptionStatus: string | null;
}): MostRelevantComparable {
  return {
    id: params.id,
    relevanceScore: params.relevanceScore,
    plan: params.plan,
    stripeSubscriptionStatus: params.stripeSubscriptionStatus,
  };
}

describe("Most relevant ordering", () => {
  it("tier grouping: all Elite first, then Pro, then Starter; preserve relevance inside tier", () => {
    const eliteLow = s({ id: "eliteLow", relevanceScore: 1, plan: "elite", stripeSubscriptionStatus: "active" });
    const eliteHigh = s({ id: "eliteHigh", relevanceScore: 100, plan: "elite", stripeSubscriptionStatus: "active" });
    const proLow = s({ id: "proLow", relevanceScore: 2, plan: "pro", stripeSubscriptionStatus: "active" });
    const proHigh = s({ id: "proHigh", relevanceScore: 200, plan: "pro", stripeSubscriptionStatus: "active" });
    const starter1 = s({ id: "starter1", relevanceScore: 9999, plan: "starter", stripeSubscriptionStatus: null });

    const sorted = [proLow, starter1, eliteLow, proHigh, eliteHigh].sort(compareMostRelevant);
    expect(sorted.map((x) => x.id)).toEqual(["eliteHigh", "eliteLow", "proHigh", "proLow", "starter1"]);
  });

  it("Elite always outranks Pro (even if less relevant)", () => {
    const pro = s({ id: "pro", relevanceScore: 9999, plan: "pro", stripeSubscriptionStatus: "active" });
    const elite = s({ id: "elite", relevanceScore: 1, plan: "elite", stripeSubscriptionStatus: "active" });

    const sorted = [pro, elite].sort(compareMostRelevant);
    expect(sorted.map((x) => x.id)).toEqual(["elite", "pro"]);
  });

  it("Pro always outranks Starter (even if less relevant)", () => {
    const starter = s({ id: "starter", relevanceScore: 9999, plan: "starter", stripeSubscriptionStatus: null });
    const pro = s({ id: "pro", relevanceScore: 1, plan: "pro", stripeSubscriptionStatus: "trialing" });

    const sorted = [starter, pro].sort(compareMostRelevant);
    expect(sorted.map((x) => x.id)).toEqual(["pro", "starter"]);
  });

  it("within the same tier, keep relevance ordering", () => {
    const pro1 = s({ id: "pro1", relevanceScore: 10, plan: "pro", stripeSubscriptionStatus: "active" });
    const pro2 = s({ id: "pro2", relevanceScore: 100, plan: "pro", stripeSubscriptionStatus: "active" });

    const sorted = [pro1, pro2].sort(compareMostRelevant);
    expect(sorted.map((x) => x.id)).toEqual(["pro2", "pro1"]);
  });

  it("gating: planRank only for active/trialing + recognized plan", () => {
    expect(getPlanRank({ plan: "pro", stripeSubscriptionStatus: "active" })).toBe(1);
    expect(getPlanRank({ plan: "elite", stripeSubscriptionStatus: "trialing" })).toBe(2);

    expect(getPlanRank({ plan: "pro", stripeSubscriptionStatus: "canceled" })).toBe(0);
    expect(getPlanRank({ plan: "starter", stripeSubscriptionStatus: "active" })).toBe(0);
    expect(getPlanRank({ plan: "unknown", stripeSubscriptionStatus: "active" })).toBe(0);
  });
});
