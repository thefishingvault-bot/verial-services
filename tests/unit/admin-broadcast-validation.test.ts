import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn().mockResolvedValue({ isAdmin: true, userId: "admin_1" }) }));
vi.mock("@/db/schema", () => ({ users: {}, notifications: {} }));

const dbMock = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ orderBy: vi.fn(() => ({ limit: vi.fn(() => ({ offset: vi.fn(async () => []) })) })) })),
      groupBy: vi.fn(async () => []),
    })),
    groupBy: vi.fn(async () => []),
  })),
  insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
};
vi.mock("@/lib/db", () => ({ db: dbMock }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin broadcast validation", () => {
  it("rejects invalid pagination", async () => {
    const { GET } = await import("@/app/api/admin/broadcast/route");
    const res = await GET(new Request("http://localhost/api/admin/broadcast?page=0&limit=0") as any);
    expect(res.status).toBe(400);
  });

  it("rejects empty message on POST", async () => {
    const { POST } = await import("@/app/api/admin/broadcast/route");
    const res = await POST(new Request("http://localhost/api/admin/broadcast", { method: "POST", body: JSON.stringify({ message: "" }) }) as any);
    expect(res.status).toBe(400);
  });
});
