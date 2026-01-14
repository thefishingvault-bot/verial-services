// @vitest-environment jsdom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextRequest } from "next/server";

const requireAdminMock = vi.fn();
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: requireAdminMock }));

const ensureUserExistsInDbMock = vi.fn();
vi.mock("@/lib/user-sync", () => ({ ensureUserExistsInDb: ensureUserExistsInDbMock }));

const writeAdminAuditLogMock = vi.fn();
vi.mock("@/lib/admin-audit", () => ({ writeAdminAuditLog: writeAdminAuditLogMock }));

// Minimal schema tokens for route queries
vi.mock("@/db/schema", () => ({
  providers: {
    id: "providers.id",
    userId: "providers.userId",
    businessName: "providers.businessName",
    handle: "providers.handle",
    status: "providers.status",
    trustLevel: "providers.trustLevel",
    trustScore: "providers.trustScore",
    createdAt: "providers.createdAt",
    isSuspended: "providers.isSuspended",
    suspensionReason: "providers.suspensionReason",
    suspensionStartDate: "providers.suspensionStartDate",
    suspensionEndDate: "providers.suspensionEndDate",
    updatedAt: "providers.updatedAt",
  },
  users: {
    id: "users.id",
    email: "users.email",
  },
  services: {
    providerId: "services.providerId",
    title: "services.title",
    region: "services.region",
    id: "services.id",
  },
  bookings: {
    id: "bookings.id",
    status: "bookings.status",
    scheduledDate: "bookings.scheduledDate",
    priceAtBooking: "bookings.priceAtBooking",
    providerId: "bookings.providerId",
    serviceId: "bookings.serviceId",
    userId: "bookings.userId",
    createdAt: "bookings.createdAt",
    updatedAt: "bookings.updatedAt",
  },
  providerSuspensions: { __table: "provider_suspensions" },
  bookingStatusEnum: {
    enumValues: [
      "pending",
      "accepted",
      "paid",
      "completed",
      "canceled_customer",
      "canceled_provider",
      "declined",
    ],
  },
}));

// Capture conditions/SQL tags without bringing in Drizzle
const sqlMock: any = (strings: any, ...values: any[]) => ({ type: "sql", strings, values });
vi.mock("drizzle-orm", () => ({
  eq: (left: any, right: any) => ({ type: "eq", args: [left, right] }),
  and: (...args: any[]) => ({ type: "and", args }),
  or: (...args: any[]) => ({ type: "or", args }),
  ilike: (left: any, right: any) => ({ type: "ilike", args: [left, right] }),
  inArray: (left: any, right: any) => ({ type: "inArray", args: [left, right] }),
  sql: sqlMock,
}));

const state = {
  providers: [] as any[],
  totalCount: 0,
  lastLimit: 0,
  lastOffset: 0,
  rejectUpdatedIds: [] as string[],
};

const dbMock = {
  select: vi.fn((selection?: any) => {
    const isCountQuery = selection && typeof selection === "object" && "count" in selection;

    if (isCountQuery) {
      const chainCount: any = {
        from: vi.fn(() => chainCount),
        innerJoin: vi.fn(() => chainCount),
        leftJoin: vi.fn(() => chainCount),
        where: vi.fn((_where: any) => Promise.resolve([{ count: state.totalCount }])),
      };
      return chainCount;
    }

    const chainList: any = {
      from: vi.fn(() => chainList),
      innerJoin: vi.fn(() => chainList),
      leftJoin: vi.fn(() => chainList),
      where: vi.fn((_where: any) => chainList),
      groupBy: vi.fn(() => chainList),
      orderBy: vi.fn(() => chainList),
      limit: vi.fn((n: number) => {
        state.lastLimit = n;
        return chainList;
      }),
      offset: vi.fn((n: number) => {
        state.lastOffset = n;
        return Promise.resolve(state.providers.slice(n, n + state.lastLimit));
      }),
    };

    return chainList;
  }),

  update: vi.fn(() => {
    const chain: any = {
      set: vi.fn(() => chain),
      where: vi.fn(() => chain),
      returning: vi.fn(() => Promise.resolve(state.rejectUpdatedIds.map((id) => ({ id })))),
    };
    return chain;
  }),
};

vi.mock("@/lib/db", () => ({ db: dbMock }));

const pushMock = vi.fn();
const currentParams = new URLSearchParams("type=providers&status=pending&region=Auckland&q=alice&page=2&pageSize=20");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => currentParams,
}));

import { AdminBulkOperationsFiltersBar } from "@/components/admin/admin-bulk-operations-filters-bar";

describe("admin bulk ops", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({ isAdmin: true, userId: "admin_1" });
    ensureUserExistsInDbMock.mockResolvedValue(undefined);

    state.providers = [];
    state.totalCount = 0;
    state.lastLimit = 0;
    state.lastOffset = 0;
    state.rejectUpdatedIds = [];

    currentParams.set("type", "providers");
    currentParams.set("status", "pending");
    currentParams.set("region", "Auckland");
    currentParams.set("q", "alice");
    currentParams.set("page", "2");
    currentParams.set("pageSize", "20");
  });

  it("mode switch preserves query params", async () => {
    const user = userEvent.setup();

    render(
      <AdminBulkOperationsFiltersBar
        operationType="providers"
        searchParams={{ status: "pending", region: "Auckland", q: "alice", page: 2, pageSize: 20 }}
        regionOptions={["Auckland"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Bookings" }));

    expect(pushMock).toHaveBeenCalledTimes(1);
    const url = String(pushMock.mock.calls[0]?.[0]);
    expect(url.startsWith("?")).toBe(true);

    const qs = new URLSearchParams(url.slice(1));
    expect(qs.get("type")).toBe("bookings");
    expect(qs.get("status")).toBe("pending");
    expect(qs.get("region")).toBe("Auckland");
    expect(qs.get("q")).toBe("alice");
    expect(qs.get("page")).toBe("2");
    expect(qs.get("pageSize")).toBe("20");
  });

  it("list endpoint paginates and returns metadata", async () => {
    state.providers = Array.from({ length: 50 }, (_, i) => ({ id: `prov_${i + 1}` }));
    state.totalCount = 50;

    const { GET } = await import("@/app/api/admin/bulk/list/route");

    const req = new NextRequest(
      "http://localhost/api/admin/bulk/list?type=providers&status=all&region=all&q=&page=2&pageSize=10",
    );

    const res = await GET(req as any);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.page).toBe(2);
    expect(json.pageSize).toBe(10);
    expect(json.totalCount).toBe(50);
    expect(json.totalPages).toBe(5);
    expect(Array.isArray(json.items)).toBe(true);
    expect(json.items).toHaveLength(10);

    // Page 2 should start at offset 10
    expect(state.lastLimit).toBe(10);
    expect(state.lastOffset).toBe(10);
  });

  it("list endpoint rejects invalid page/pageSize", async () => {
    const { GET } = await import("@/app/api/admin/bulk/list/route");

    const badPage = new NextRequest(
      "http://localhost/api/admin/bulk/list?type=providers&status=all&region=all&q=&page=0&pageSize=10",
    );
    const res1 = await GET(badPage as any);
    expect(res1.status).toBe(400);

    const badSize = new NextRequest(
      "http://localhost/api/admin/bulk/list?type=providers&status=all&region=all&q=&page=1&pageSize=101",
    );
    const res2 = await GET(badSize as any);
    expect(res2.status).toBe(400);
  });

  it("bulk action rejects invalid action", async () => {
    const { POST } = await import("@/app/api/admin/bulk/action/route");

    const req = new Request("http://localhost/api/admin/bulk/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "providers", action: "not-real", ids: ["prov_1"] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("audit logging writes per affected id (reject)", async () => {
    state.rejectUpdatedIds = ["prov_2", "prov_3"]; // only these were updated

    const { POST } = await import("@/app/api/admin/bulk/action/route");

    const req = new Request("http://localhost/api/admin/bulk/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "providers", action: "reject", ids: ["prov_1", "prov_2", "prov_3"] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(writeAdminAuditLogMock).toHaveBeenCalledTimes(2);
    const resourceIds = writeAdminAuditLogMock.mock.calls.map((c) => c[0]?.resourceId);
    expect(resourceIds).toEqual(["prov_2", "prov_3"]);
  });
});
