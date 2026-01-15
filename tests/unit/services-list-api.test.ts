import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as listServices } from "@/app/api/services/list/route";
import * as dbMod from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => Promise.resolve({ userId: "user_123" }),
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn(),
  rateLimitResponse: (retryAfter: number) =>
    new Response(`Rate limited. Retry after ${retryAfter}`, { status: 429 }),
}));

describe("services list API", () => {
  const mockSelect = vi.fn();
  const baseQuery = {
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn(),
  } as any;

  const countQuery = {
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(dbMod, "db", "get").mockReturnValue({
      select: mockSelect.mockImplementation((shape: any) => ({
        from: () => {
          if (shape && typeof shape === "object" && Object.keys(shape).includes("count")) {
            return countQuery;
          }
          return baseQuery;
        },
      })),
    } as any);

    vi.mocked(enforceRateLimit).mockResolvedValue({ success: true, retryAfter: 0 } as any);
  });

  it("sorts by rating descending and returns rating fields", async () => {
    const fakeRows = [
      {
        id: "svc_high",
        title: "High",
        slug: "high",
        description: "",
        priceInCents: 2000,
        category: "cleaning",
        coverImageUrl: null,
        createdAt: new Date("2024-02-01"),
        providerId: "prov_2",
        providerHandle: "prov2",
        providerName: "Provider 2",
        providerVerified: true,
        providerTrust: "gold",
        serviceRegion: "auckland",
        serviceSuburb: "ponsonby",
        avgRating: 4.8,
        reviewCount: 12,
        favoriteCount: 5,
        isFavorited: false,
      },
      {
        id: "svc_low",
        title: "Low",
        slug: "low",
        description: "",
        priceInCents: 1000,
        category: "cleaning",
        coverImageUrl: null,
        createdAt: new Date("2024-01-01"),
        providerId: "prov_1",
        providerHandle: "prov1",
        providerName: "Provider 1",
        providerVerified: true,
        providerTrust: "bronze",
        serviceRegion: "auckland",
        serviceSuburb: "ponsonby",
        avgRating: 3.2,
        reviewCount: 2,
        favoriteCount: 1,
        isFavorited: false,
      },
    ];

    baseQuery.offset.mockResolvedValue(fakeRows);
    countQuery.where.mockResolvedValue([{ count: fakeRows.length }]);

    const req = new NextRequest("http://localhost/api/services/list?sort=rating_desc");
    const res = await listServices(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.services[0].id).toBe("svc_high");
    expect(json.services[0].avgRating).toBe(4.8);
    expect(json.services[0].reviewCount).toBe(12);
  });

  it("handles text query and suburb filter without errors", async () => {
    baseQuery.offset.mockResolvedValue([]);
    countQuery.where.mockResolvedValue([{ count: 0 }]);

    const req = new NextRequest(
      "http://localhost/api/services/list?q=clean&suburb=ponsonby&region=auckland",
    );
    const res = await listServices(req);
    expect(res.status).toBe(200);
  });
});
