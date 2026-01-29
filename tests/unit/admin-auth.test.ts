import { describe, expect, it, beforeEach, vi } from "vitest";

const authMock = vi.fn();
const clerkClientMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  clerkClient: clerkClientMock,
}));

// These modules are imported by admin-auth; they shouldn't be touched in these tests
// (we rely on sessionClaims roles), but mock them to keep tests isolated.
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(async () => null),
      },
    },
  },
}));

vi.mock("@/db/schema", () => ({
  users: { id: "users.id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (...args: any[]) => ({ type: "eq", args }),
}));

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 when signed out", async () => {
    authMock.mockResolvedValue({ userId: null, sessionClaims: null });

    const { requireAdmin } = await import("@/lib/admin-auth");
    const res = await requireAdmin();

    expect(res.isAdmin).toBe(false);
    expect(res.response.status).toBe(401);
  });

  it("returns 403 when signed in but not admin", async () => {
    authMock.mockResolvedValue({
      userId: "user_1",
      sessionClaims: { publicMetadata: { role: "user" } },
    });

    const { requireAdmin } = await import("@/lib/admin-auth");
    const res = await requireAdmin();

    expect(res.isAdmin).toBe(false);
    expect(res.response.status).toBe(403);
  });

  it("returns isAdmin=true when signed in as admin", async () => {
    authMock.mockResolvedValue({
      userId: "user_admin",
      sessionClaims: { publicMetadata: { role: "admin" } },
    });

    const { requireAdmin } = await import("@/lib/admin-auth");
    const res = await requireAdmin();

    expect(res.isAdmin).toBe(true);
    if (res.isAdmin) {
      expect(res.userId).toBe("user_admin");
    }
  });
});
