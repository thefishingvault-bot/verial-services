import { describe, expect, test } from "vitest";
import { getSimilarServices } from "@/lib/similar-services";
import { createServiceFixture, createProviderFixture } from "../utils/fixtures";
import { createSimilarServicesClient } from "../utils/mock-db";

const baseProvider = createProviderFixture({ baseRegion: "auckland", status: "approved" });
const baseService = createServiceFixture({ id: "svc_base", category: "cleaning", provider: baseProvider });

function buildRow(id: string, overrides: Partial<any> = {}) {
  return {
    id,
    title: `Service ${id}`,
    slug: `${id}-slug`,
    description: "desc",
    priceInCents: 10000,
    category: "cleaning",
    coverImageUrl: null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    providerId: `prov_${id}`,
    providerHandle: `${id}-handle`,
    providerBusinessName: `${id} biz`,
    providerTrustScore: 50,
    providerVerified: true,
    providerRegion: "auckland",
    avgRating: 4,
    reviewCount: 10,
    favoriteCount: 2,
    providerSuspended: false,
    ...overrides,
  };
}

describe("getSimilarServices", () => {
  test("returns ranked results from same category and region", async () => {
    const rows = [
      buildRow("a", { avgRating: 4.9, reviewCount: 30, favoriteCount: 20, providerTrustScore: 80 }),
      buildRow("b", { avgRating: 4.6, reviewCount: 10, favoriteCount: 10, providerTrustScore: 60 }),
      buildRow("c", { avgRating: 3.9, reviewCount: 5, providerTrustScore: 40 }),
      buildRow("base", { id: "svc_base" }),
      buildRow("other-cat", { category: "plumbing" }),
    ];

    const client = createSimilarServicesClient({ baseService, rows });
    const result = await getSimilarServices(baseService.id, client as any);

    expect(result?.map((r) => r.slug)).toMatchInlineSnapshot(`[
  "a-slug",
  "b-slug",
  "c-slug",
]`);
    expect(result?.every((r) => r.category === "cleaning")).toBe(true);
    expect(result?.every((r) => r.providerRegion === baseProvider.baseRegion)).toBe(true);
  });

  test("handles fewer than three results and excludes suspended providers", async () => {
    const rows = [
      buildRow("s1", { providerSuspended: true }),
      buildRow("s2", { providerTrustScore: 10, reviewCount: 0, avgRating: 0 }),
    ];
    const client = createSimilarServicesClient({ baseService, rows });
    const result = await getSimilarServices(baseService.id, client as any);

    expect(result).toHaveLength(1);
    expect(result?.[0].slug).toBe("s2-slug");
  });

  test("returns null when base service missing", async () => {
    const client = createSimilarServicesClient({ baseService: null, rows: [] });
    const result = await getSimilarServices("missing", client as any);
    expect(result).toBeNull();
  });
});
