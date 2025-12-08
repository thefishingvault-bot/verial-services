import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getUserFavoriteServices = vi.fn();
const authMock = vi.fn();

vi.mock("@/lib/favorites", () => ({
  getUserFavoriteServices: getUserFavoriteServices,
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

describe("/api/favorites/list", () => {
  beforeEach(() => {
    getUserFavoriteServices.mockResolvedValue([]);
    authMock.mockResolvedValue({ userId: "user_1" });
  });

  it("uses top sort when requested", async () => {
    const { GET } = await import("@/app/api/favorites/list/route");
    const req = new NextRequest("http://localhost/api/favorites/list?sort=top");
    await GET(req as any);

    expect(getUserFavoriteServices).toHaveBeenCalledWith("user_1", "top", expect.anything());
  });

  it("rejects when unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null });
    const { GET } = await import("@/app/api/favorites/list/route");
    const res = await GET(new NextRequest("http://localhost/api/favorites/list"));
    expect(res.status).toBe(401);
  });
});
