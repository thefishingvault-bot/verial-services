import { describe, expect, it } from "vitest";
import { compareMostRelevant, type MostRelevantComparable } from "@/lib/services-most-relevant";

function baseService(id: string): MostRelevantComparable {
  return {
    id,
    title: "House Cleaning",
    description: "Great cleaning service",
    providerBusinessName: "Sparkle Co",
    providerHandle: "sparkle",
    avgRating: 4.5,
    reviewCount: 20,
    trustScore: 70,
    isVerified: true,
    favoriteCount: 10,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    planBadge: null,
  };
}

describe("Most relevant ordering", () => {
  it("orders Elite > Pro > Starter when otherwise equal", () => {
    const starter = { ...baseService("starter"), planBadge: null };
    const pro = { ...baseService("pro"), planBadge: "pro" as const };
    const elite = { ...baseService("elite"), planBadge: "elite" as const };

    const sorted = [starter, elite, pro].sort((a, b) => compareMostRelevant(a, b, null));
    expect(sorted.map((s) => s.id)).toEqual(["elite", "pro", "starter"]);
  });

  it("does not let plan beat clearly stronger relevance signals (text match)", () => {
    const q = "emergency";
    const starter = { ...baseService("starter"), title: "Emergency House Cleaning", planBadge: null };
    const pro = { ...baseService("pro"), title: "House Cleaning", planBadge: "pro" as const };
    const elite = { ...baseService("elite"), title: "House Cleaning", planBadge: "elite" as const };

    const sorted = [elite, pro, starter].sort((a, b) => compareMostRelevant(a, b, q));
    expect(sorted[0]?.id).toBe("starter");
  });

  it("does not let plan beat large quality gaps (rating/reviews)", () => {
    const starterStrong = {
      ...baseService("starter-strong"),
      avgRating: 4.95,
      reviewCount: 120,
      planBadge: null,
    };
    const eliteWeak = {
      ...baseService("elite-weak"),
      avgRating: 3.2,
      reviewCount: 2,
      planBadge: "elite" as const,
    };

    const sorted = [eliteWeak, starterStrong].sort((a, b) => compareMostRelevant(a, b, null));
    expect(sorted[0]?.id).toBe("starter-strong");
  });
});
