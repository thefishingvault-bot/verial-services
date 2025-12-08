import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn().mockResolvedValue({ isAdmin: true, userId: "admin_1" }) }));
vi.mock("@/server/admin/fees", () => ({ getAdminFeesReport: vi.fn(async () => ({})), getFeesByProvider: vi.fn(async () => []) }));

const nowYear = new Date().getUTCFullYear();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin fees validation", () => {
  it("rejects missing report dates", async () => {
    const { GET } = await import("@/app/api/admin/fees/report/route");
    const res = await GET(new Request("http://localhost/api/admin/fees/report"));
    expect(res.status).toBe(400);
  });

  it("accepts valid report dates", async () => {
    const { GET } = await import("@/app/api/admin/fees/report/route");
    const res = await GET(new Request("http://localhost/api/admin/fees/report?from=2024-01-01&to=2024-01-31"));
    expect(res.status).toBe(200);
  });

  it("rejects invalid year for fees by provider", async () => {
    const { GET } = await import("@/app/api/admin/fees/by-provider/route");
    const res = await GET(new Request("http://localhost/api/admin/fees/by-provider?year=abc"));
    expect(res.status).toBe(400);
  });

  it("accepts default year when omitted", async () => {
    const { GET } = await import("@/app/api/admin/fees/by-provider/route");
    const res = await GET(new Request("http://localhost/api/admin/fees/by-provider"));
    expect(res.status).toBe(200);
  });
});
