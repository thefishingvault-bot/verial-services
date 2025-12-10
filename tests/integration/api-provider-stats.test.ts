import { describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/providers/[providerId]/stats/route";
import { ProviderStats } from "@/lib/provider-stats";

vi.mock("@/lib/provider-stats", () => {
  return {
    getProviderStats: vi.fn(),
  };
});

const { getProviderStats } = await import("@/lib/provider-stats");

describe("/api/providers/[providerId]/stats", () => {
  test("returns stats payload", async () => {
    const payload: ProviderStats = {
      completionRate: 80,
      cancellationRate: 5,
      avgResponseMinutes: 10,
      repeatCustomers: 3,
      totalServices: 4,
      yearsActive: 2,
      isVerified: true,
      trustLevel: "gold",
      trustScore: 90,
    };
    (getProviderStats as any).mockResolvedValue(payload);

    const req = new NextRequest("http://localhost/api/providers/prov_1/stats");
    const res = await GET(req, { params: Promise.resolve({ providerId: "prov_1" }) });
    const json = await (res as Response).json();

    expect(res.status).toBe(200);
    expect(json).toEqual(payload);
  });

  test("returns 404 when helper yields null", async () => {
    (getProviderStats as any).mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/providers/missing/stats");
    const res = await GET(req, { params: Promise.resolve({ providerId: "missing" }) });
    expect(res.status).toBe(404);
  });

  test("validates missing providerId", async () => {
    const req = new NextRequest("http://localhost/api/providers//stats");
    const res = await GET(req, { params: Promise.resolve({ providerId: "" as any }) });
    expect(res.status).toBe(400);
  });
});
