import { describe, expect, it } from "vitest";
import { getUserFavoriteServices } from "@/lib/favorites";

const baseRow = {
  description: null,
  category: "cleaning",
  coverImageUrl: null,
  providerHandle: "pro",
  providerBusinessName: "Biz",
  providerBaseRegion: "auckland",
  providerTrustLevel: "gold" as const,
  providerTrustScore: 80,
  providerVerified: true,
  avgRating: 4,
  reviewCount: 10,
  favoriteCount: 3,
  chargesGst: true,
};

function makeRow(overrides: Partial<any>) {
  return {
    id: `svc_${Math.random().toString(36).slice(2, 6)}`,
    slug: "slug",
    title: "Test",
    priceInCents: 1000,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    favoritedAt: new Date("2024-02-01T00:00:00Z"),
    providerId: "prov_1",
    providerStatus: "approved",
    providerSuspended: false,
    ...baseRow,
    ...overrides,
  };
}

describe("getUserFavoriteServices", () => {
  it("sorts by recent first, then ranking", async () => {
    const rows = [
      makeRow({ id: "svc_old", favoritedAt: new Date("2024-01-10T00:00:00Z"), avgRating: 5, reviewCount: 50 }),
      makeRow({ id: "svc_new", favoritedAt: new Date("2024-02-10T00:00:00Z"), avgRating: 4 }),
    ];

    const client = buildClient(rows);
    const result = await getUserFavoriteServices("user_1", "recent", client as any);

    expect(result.map((r) => r.id)).toEqual(["svc_new", "svc_old"]);
  });

  it("sorts by ranking when sort=top", async () => {
    const rows = [
      makeRow({ id: "svc_low", favoritedAt: new Date("2024-02-10T00:00:00Z"), avgRating: 3, reviewCount: 2, providerTrustScore: 20 }),
      makeRow({ id: "svc_high", favoritedAt: new Date("2024-01-10T00:00:00Z"), avgRating: 4.8, reviewCount: 60, providerTrustScore: 90 }),
    ];

    const client = buildClient(rows);
    const result = await getUserFavoriteServices("user_1", "top", client as any);

    expect(result[0].id).toBe("svc_high");
  });

  it("filters out suspended providers", async () => {
    const rows = [
      makeRow({ id: "svc_ok" }),
      makeRow({ id: "svc_block", providerSuspended: true }),
    ];

    const client = buildClient(rows);
    const result = await getUserFavoriteServices("user_1", "recent", client as any);

    expect(result.map((r) => r.id)).toEqual(["svc_ok"]);
  });
});

function buildClient(rows: any[]) {
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            leftJoin: () => ({
              where: () => ({
                groupBy: () => rows.filter((r) => r.providerStatus === "approved" && !r.providerSuspended),
              }),
            }),
          }),
        }),
      }),
    }),
  };
}
