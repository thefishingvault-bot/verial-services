import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn().mockResolvedValue({ isAdmin: true, userId: "admin_1" }) }));
vi.mock("@/db/schema", () => ({ riskRules: {} }));

const dbMock = {
  insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn(async () => [{ enabled: false }]) })),
    })),
  })),
};
vi.mock("@/lib/db", () => ({ db: dbMock }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin trust rules validation", () => {
  it("rejects invalid severity on create", async () => {
    const { POST } = await import("@/app/api/admin/trust/rules/create/route");
      const res = await POST(new NextRequest("http://localhost/api/admin/trust/rules", { method: "POST", body: JSON.stringify({ name: "n", incidentType: "fraud", severity: "bad" }) }));
    expect(res.status).toBe(400);
  });

  it("accepts valid create payload", async () => {
    const { POST } = await import("@/app/api/admin/trust/rules/create/route");
      const res = await POST(new NextRequest("http://localhost/api/admin/trust/rules", { method: "POST", body: JSON.stringify({ name: "n", incidentType: "fraud", severity: "high", trustScorePenalty: 10, autoSuspend: true, suspendDurationDays: 7 }) }));
    expect(res.status).toBe(307); // redirect
    expect(dbMock.insert).toHaveBeenCalled();
  });

  it("rejects empty ruleId on toggle", async () => {
    const { POST } = await import("@/app/api/admin/trust/rules/[ruleId]/toggle/route");
      const res = await POST(new NextRequest("http://localhost/api/admin/trust/rules//toggle", { method: "POST" }), { params: Promise.resolve({ ruleId: "" }) } as any);
    expect(res.status).toBe(400);
  });
});
