import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.fn();
const recMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/recommendations", () => ({ getRecommendedServicesForUser: recMock }));

describe("/api/recommendations/providers", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: "user_1" });
    recMock.mockResolvedValue([{ serviceId: "svc_1" }]);
  });

  it("returns recommendations for authenticated user", async () => {
    const { GET } = await import("@/app/api/recommendations/providers/route");
      const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items[0].serviceId).toBe("svc_1");
    expect(recMock).toHaveBeenCalledWith("user_1", 6);
  });

  it("rejects unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null });
    const { GET } = await import("@/app/api/recommendations/providers/route");
      const res = await GET();
    expect(res.status).toBe(401);
  });
});
