import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("drizzle-orm", () => ({
  eq: (left: any, right: any) => ({ type: "eq", args: [left, right] }),
}));

const requireAdminMock = vi.fn();
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: requireAdminMock }));

const ensureUserExistsInDbMock = vi.fn();
vi.mock("@/lib/user-sync", () => ({ ensureUserExistsInDb: ensureUserExistsInDbMock }));

const writeAdminAuditLogMock = vi.fn();
vi.mock("@/lib/admin-audit", () => ({ writeAdminAuditLog: writeAdminAuditLogMock }));

vi.mock("@/lib/validation/admin", () => ({
  ProviderIdSchema: {},
  ProviderSuspensionSchema: {},
  invalidResponse: (err: any) => new Response(String(err), { status: 400 }),
  parseParams: (_schema: any, data: any) => ({ ok: true, data }),
  parseForm: async (_schema: any, _req: any) => ({
    ok: true,
    data: {
      reason: "Test reason",
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: null,
    },
  }),
}));

vi.mock("@/db/schema", () => ({
  providers: {
    id: "providers.id",
    isSuspended: "providers.isSuspended",
    suspensionReason: "providers.suspensionReason",
    suspensionStartDate: "providers.suspensionStartDate",
    suspensionEndDate: "providers.suspensionEndDate",
    updatedAt: "providers.updatedAt",
  },
  providerSuspensions: { __table: "provider_suspensions" },
}));

const state = {
  providerRow: [] as any[],
};

const dbMock = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => state.providerRow),
      })),
    })),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(async () => undefined),
    })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(async () => undefined),
  })),
};

vi.mock("@/lib/db", () => ({ db: dbMock }));

describe("admin suspend route audit logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({ isAdmin: true, userId: "admin_1" });
    ensureUserExistsInDbMock.mockResolvedValue(undefined);
    state.providerRow = [
      {
        id: "prov_1",
        isSuspended: false,
        suspensionReason: null,
        suspensionStartDate: null,
        suspensionEndDate: null,
      },
    ];
  });

  it("writes an admin audit log when suspending", async () => {
    const { POST } = await import("@/app/api/admin/providers/[providerId]/suspend/route");

    const res = await POST(
      new NextRequest("http://localhost/api/admin/providers/prov_1/suspend", { method: "POST" }),
      { params: Promise.resolve({ providerId: "prov_1" }) } as any,
    );

    expect(res.status).toBe(307);
    expect(writeAdminAuditLogMock).toHaveBeenCalled();

    const call = writeAdminAuditLogMock.mock.calls[0]?.[0];
    expect(call.action).toBe("PROVIDER_SUSPEND");
    expect(call.resource).toBe("provider");
    expect(call.resourceId).toBe("prov_1");
  });
});
