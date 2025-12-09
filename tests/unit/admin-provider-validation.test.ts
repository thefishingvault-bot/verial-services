import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn().mockResolvedValue({ isAdmin: true, userId: "admin_1" }) }));
vi.mock("@/db/schema", () => ({ providers: {}, providerSuspensions: {} }));

const dbMock = {
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(async () => ([{ id: "prov_1", isVerified: true }])) })) })) })),
  select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => [{ id: "prov_1", isSuspended: false }]) })) })) })),
  insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
};
vi.mock("@/lib/db", () => ({ db: dbMock }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin provider validation", () => {
  it("rejects invalid isVerified body", async () => {
    const { PATCH } = await import("@/app/api/admin/providers/[providerId]/verification/route");
    const res = await PATCH(new NextRequest("http://localhost/api/admin/providers/prov_1/verification", { method: "PATCH", body: JSON.stringify({}) }), { params: Promise.resolve({ providerId: "prov_1" }) } as any);
    expect(res.status).toBe(400);
  });

  it("accepts valid verification payload", async () => {
    const { PATCH } = await import("@/app/api/admin/providers/[providerId]/verification/route");
    const res = await PATCH(new NextRequest("http://localhost/api/admin/providers/550e8400-e29b-41d4-a716-446655440000/verification", { method: "PATCH", body: JSON.stringify({ isVerified: true }) }), { params: Promise.resolve({ providerId: "550e8400-e29b-41d4-a716-446655440000" }) } as any);
    expect(res.status).toBe(200);
    expect(dbMock.update).toHaveBeenCalled();
  });

  it("rejects suspend missing reason", async () => {
    const { POST } = await import("@/app/api/admin/providers/[providerId]/suspend/route");
    const form = new FormData();
    form.set("startDate", new Date().toISOString());
    const res = await POST(new NextRequest("http://localhost/api/admin/providers/550e8400-e29b-41d4-a716-446655440000/suspend", { method: "POST", body: form as any }), { params: Promise.resolve({ providerId: "550e8400-e29b-41d4-a716-446655440000" }) } as any);
    expect(res.status).toBe(400);
  });

  it("rejects ban with invalid providerId", async () => {
    const { POST } = await import("@/app/api/admin/providers/[providerId]/ban/route");
    const res = await POST(new NextRequest("http://localhost/api/admin/providers/not-a-uuid/ban", { method: "POST", body: JSON.stringify({ reason: "x" }) }), { params: Promise.resolve({ providerId: "not-a-uuid" }) } as any);
    expect(res.status).toBe(400);
  });
});
