import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Minimal drizzle helpers for route imports
vi.mock("drizzle-orm", () => ({
  eq: (left: any, right: any) => ({ type: "eq", args: [left, right] }),
  and: (...args: any[]) => ({ type: "and", args }),
}));

// Auth + user sync are mocked per-test
const requireAdminMock = vi.fn();
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: requireAdminMock }));

const ensureUserExistsInDbMock = vi.fn();
vi.mock("@/lib/user-sync", () => ({ ensureUserExistsInDb: ensureUserExistsInDbMock }));

// Schema objects are only used as tokens by the mocked DB
vi.mock("@/db/schema", () => ({
  providers: {
    id: "providers.id",
    kycStatus: "providers.kycStatus",
    kycVerifiedAt: "providers.kycVerifiedAt",
    updatedAt: "providers.updatedAt",
  },
  adminAuditLogs: { __table: "admin_audit_logs" },
}));

const state = {
  prior: [] as any[],
  returning: [] as any[],
};

const txMock = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => state.prior),
      })),
    })),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(async () => state.returning),
      })),
    })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(async () => undefined),
  })),
};

const dbMock = {
  transaction: vi.fn(async (cb: any) => cb(txMock)),
};
vi.mock("@/lib/db", () => ({ db: dbMock }));

beforeEach(() => {
  vi.clearAllMocks();
  state.prior = [];
  state.returning = [];

  requireAdminMock.mockResolvedValue({ isAdmin: true, userId: "admin_1" });
  ensureUserExistsInDbMock.mockResolvedValue(undefined);
});

describe("admin provider kyc PATCH API", () => {
  it("returns 401 when not signed in", async () => {
    requireAdminMock.mockResolvedValue({
      isAdmin: false,
      response: new Response("Unauthorized", { status: 401 }),
    });

    const { PATCH } = await import("@/app/api/admin/providers/[providerId]/kyc/route");

    const res = await PATCH(
      new NextRequest("http://localhost/api/admin/providers/prov_1/kyc", {
        method: "PATCH",
        body: JSON.stringify({ action: "set_status", kycStatus: "verified" }),
      }),
      { params: Promise.resolve({ providerId: "prov_1" }) } as any,
    );

    expect(res.status).toBe(401);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("returns 403 when signed in but not admin", async () => {
    requireAdminMock.mockResolvedValue({
      isAdmin: false,
      response: new Response("Forbidden", { status: 403 }),
    });

    const { PATCH } = await import("@/app/api/admin/providers/[providerId]/kyc/route");

    const res = await PATCH(
      new NextRequest("http://localhost/api/admin/providers/prov_1/kyc", {
        method: "PATCH",
        body: JSON.stringify({ action: "set_status", kycStatus: "verified" }),
      }),
      { params: Promise.resolve({ providerId: "prov_1" }) } as any,
    );

    expect(res.status).toBe(403);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid providerId param", async () => {
    const { PATCH } = await import("@/app/api/admin/providers/[providerId]/kyc/route");

    const res = await PATCH(
      new NextRequest("http://localhost/api/admin/providers/bad/kyc", {
        method: "PATCH",
        body: JSON.stringify({ action: "set_status", kycStatus: "verified" }),
      }),
      { params: Promise.resolve({ providerId: "bad" }) } as any,
    );

    expect(res.status).toBe(400);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid body", async () => {
    const { PATCH } = await import("@/app/api/admin/providers/[providerId]/kyc/route");

    const res = await PATCH(
      new NextRequest("http://localhost/api/admin/providers/prov_1/kyc", {
        method: "PATCH",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ providerId: "prov_1" }) } as any,
    );

    expect(res.status).toBe(400);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("returns 400 when rejecting without a reason", async () => {
    const { PATCH } = await import("@/app/api/admin/providers/[providerId]/kyc/route");

    const res = await PATCH(
      new NextRequest("http://localhost/api/admin/providers/prov_1/kyc", {
        method: "PATCH",
        body: JSON.stringify({ action: "set_status", kycStatus: "rejected" }),
      }),
      { params: Promise.resolve({ providerId: "prov_1" }) } as any,
    );

    expect(res.status).toBe(400);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("returns 404 when provider not found", async () => {
    state.prior = [];

    const { PATCH } = await import("@/app/api/admin/providers/[providerId]/kyc/route");

    const res = await PATCH(
      new NextRequest("http://localhost/api/admin/providers/prov_1/kyc", {
        method: "PATCH",
        body: JSON.stringify({ action: "set_status", kycStatus: "verified" }),
      }),
      { params: Promise.resolve({ providerId: "prov_1" }) } as any,
    );

    expect(res.status).toBe(404);
    expect(txMock.update).not.toHaveBeenCalled();
    expect(txMock.insert).not.toHaveBeenCalled();
  });

  it("updates provider and writes an audit log", async () => {
    state.prior = [{ id: "prov_1", kycStatus: "pending_review" }];
    state.returning = [
      {
        id: "prov_1",
        kycStatus: "verified",
        kycVerifiedAt: new Date("2025-01-01"),
        updatedAt: new Date("2025-01-01"),
      },
    ];

    const { PATCH } = await import("@/app/api/admin/providers/[providerId]/kyc/route");

    const res = await PATCH(
      new NextRequest("http://localhost/api/admin/providers/prov_1/kyc", {
        method: "PATCH",
        body: JSON.stringify({ action: "set_status", kycStatus: "verified" }),
      }),
      { params: Promise.resolve({ providerId: "prov_1" }) } as any,
    );

    expect(res.status).toBe(200);
    expect(ensureUserExistsInDbMock).toHaveBeenCalledWith("admin_1", "admin");
    expect(txMock.update).toHaveBeenCalled();
    expect(txMock.insert).toHaveBeenCalled();
  });
});
