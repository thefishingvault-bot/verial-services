import { describe, expect, it } from "vitest";
import { FAVORITE_BOOST, scoreService, sortServicesByScore, type RankableService } from "@/lib/ranking";

const base: RankableService = {
  id: "a",
  priceInCents: 10000,
  avgRating: 4.5,
  reviewCount: 20,
  trustScore: 70,
  createdAt: new Date("2024-01-01T00:00:00Z"),
  isVerified: true,
  favoriteCount: 5,
};

function clone(overrides: Partial<RankableService> = {}): RankableService {
  return { ...base, ...overrides };
}

describe("ranking score", () => {
  it("keeps base score when not favorited", () => {
    const score = scoreService(clone({ isFavoritedByUser: false }));
    const expected = scoreService({ ...clone(), isFavoritedByUser: false });
    expect(score).toBeCloseTo(expected, 6);
  });

  it("applies deterministic boost when favorited", () => {
    const without = scoreService(clone({ isFavoritedByUser: false }));
    const withFav = scoreService(clone({ isFavoritedByUser: true }));
    expect(withFav - without).toBeCloseTo(FAVORITE_BOOST, 6);
  });

  it("does not override large trust or rating gaps", () => {
    const favored = clone({ id: "fav", isFavoritedByUser: true, avgRating: 3.0, reviewCount: 2, trustScore: 20 });
    const strong = clone({ id: "strong", isFavoritedByUser: false, avgRating: 4.9, reviewCount: 80, trustScore: 90 });

    const [first] = sortServicesByScore([favored, strong]);
    expect(first.id).toBe("strong");
  });

  it("breaks ties deterministically with favorite boost", () => {
    const a = clone({ id: "a", avgRating: 4.2, reviewCount: 10, isFavoritedByUser: true });
    const b = clone({ id: "b", avgRating: 4.2, reviewCount: 10, isFavoritedByUser: false });

    const [first] = sortServicesByScore([a, b]);
    expect(first.id).toBe("a");
  });
});
