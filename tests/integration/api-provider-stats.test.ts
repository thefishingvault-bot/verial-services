import { describe, expect, test, vi } from "vitest";
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

    const res = await GET(new Request("http://localhost/api/providers/prov_1/stats"), { params: { providerId: "prov_1" } });
    const json = await (res as Response).json();

    expect(res.status).toBe(200);
    expect(json).toEqual(payload);
  });

  test("returns 404 when helper yields null", async () => {
    (getProviderStats as any).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/providers/missing/stats"), { params: { providerId: "missing" } });
    expect(res.status).toBe(404);
  });

  test("validates missing providerId", async () => {
    const res = await GET(new Request("http://localhost/api/providers//stats"), { params: { providerId: "" as any } });
    expect(res.status).toBe(400);
  });
});
