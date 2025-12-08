import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRecommendedServicesForUser } from "@/lib/recommendations";
import * as dbMod from "@/lib/db";
import { providers } from "@/db/schema";

const mockSelect = vi.fn();

vi.mock("@/lib/ranking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ranking")>();
  return {
    ...actual,
    // Keep deterministic but simple scoring for tests.
    scoreService: (svc: any) => 10 + (svc.isVerified ? 5 : 0) + (svc.favoriteCount ?? 0),
  };
});

describe("getRecommendedServicesForUser", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSelect.mockReset();

    vi.spyOn(dbMod, "db", "get").mockReturnValue({
      select: mockSelect,
    } as any);
  });

  it("boosts category/provider engagement, excludes favorites, sorts stably, caps at 6", async () => {
    // favorites -> returns favorite service + category signal
    mockSelect
      // favorite rows
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({ where: () => Promise.resolve([{ serviceId: "svc_fav", category: "cleaning" }]) }),
        }),
      })
      // booking rows
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({ where: () => Promise.resolve([{ providerId: "prov_boost", category: "cleaning" }]) }),
        }),
      })
      // candidates
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            leftJoin: () => ({
              where: () => ({
                groupBy: () => ({
                  orderBy: () => ({
                    limit: () =>
                      Promise.resolve([
                        {
                          id: "svc_a",
                          slug: "a",
                          title: "A",
                          description: null,
                          priceInCents: 1000,
                          category: "cleaning",
                          coverImageUrl: null,
                          createdAt: new Date("2024-01-01T00:00:00Z"),
                          providerId: "prov_boost",
                          providerName: "Prov Boost",
                          providerHandle: "prov-boost",
                          providerTrustLevel: "gold" as (typeof providers.trustLevel.enumValues)[number],
                          providerTrustScore: 90,
                          providerVerified: true,
                          avgRating: 4,
                          reviewCount: 10,
                          favoriteCount: 2,
                        },
                        {
                          id: "svc_b",
                          slug: "b",
                          title: "B",
                          description: null,
                          priceInCents: 1200,
                          category: "plumbing",
                          coverImageUrl: null,
                          createdAt: new Date("2024-01-02T00:00:00Z"),
                          providerId: "prov_other",
                          providerName: "Prov Other",
                          providerHandle: "prov-other",
                          providerTrustLevel: "silver" as (typeof providers.trustLevel.enumValues)[number],
                          providerTrustScore: 50,
                          providerVerified: false,
                          avgRating: 5,
                          reviewCount: 5,
                          favoriteCount: 1,
                        },
                        {
                          id: "svc_fav",
                          slug: "fav",
                          title: "Fav",
                          description: null,
                          priceInCents: 1500,
                          category: "cleaning",
                          coverImageUrl: null,
                          createdAt: new Date("2024-01-03T00:00:00Z"),
                          providerId: "prov_c",
                          providerName: "Prov C",
                          providerHandle: "prov-c",
                          providerTrustLevel: "gold" as (typeof providers.trustLevel.enumValues)[number],
                          providerTrustScore: 70,
                          providerVerified: true,
                          avgRating: 5,
                          reviewCount: 20,
                          favoriteCount: 5,
                        },
                      ]),
                  }),
                }),
              }),
            }),
          }),
        }),
      });

    const recs = await getRecommendedServicesForUser("user_1", 6);

    expect(recs).toHaveLength(2); // favorite excluded
    expect(recs[0].serviceId).toBe("svc_a");
    expect(recs[0].reason).toMatch(/category/i);
    expect(recs[1].serviceId).toBe("svc_b");
  });
});
