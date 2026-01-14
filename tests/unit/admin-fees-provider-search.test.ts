import { beforeEach, describe, expect, it, vi } from "vitest";

const ilikeMock = vi.fn((column: any, pattern: any) => ({ type: "ilike", args: [column, pattern] }));
const andMock = vi.fn((...conditions: any[]) => ({ type: "and", args: conditions }));

vi.mock("drizzle-orm", () => ({
  and: (...conditions: any[]) => andMock(...conditions),
  between: (...args: any[]) => ({ type: "between", args }),
  desc: (column: any) => ({ type: "desc", args: [column] }),
  eq: (left: any, right: any) => ({ type: "eq", args: [left, right] }),
  gte: (left: any, right: any) => ({ type: "gte", args: [left, right] }),
  ilike: (column: any, pattern: any) => ilikeMock(column, pattern),
  inArray: (...args: any[]) => ({ type: "inArray", args }),
  lte: (left: any, right: any) => ({ type: "lte", args: [left, right] }),
  sql: (strings: any, ...values: any[]) => ({ type: "sql", strings, values }),
}));

vi.mock("@/db/schema", () => ({
  bookings: {
    id: "bookings.id",
    status: "bookings.status",
    updatedAt: "bookings.updatedAt",
    priceAtBooking: "bookings.priceAtBooking",
    serviceId: "bookings.serviceId",
    providerId: "bookings.providerId",
    userId: "bookings.userId",
  },
  services: {
    id: "services.id",
    title: "services.title",
  },
  providers: {
    id: "providers.id",
    businessName: "providers.businessName",
  },
  users: {
    id: "users.id",
    email: "users.email",
  },
  providerEarnings: {
    paidAt: "providerEarnings.paidAt",
    status: "providerEarnings.status",
    grossAmount: "providerEarnings.grossAmount",
    platformFeeAmount: "providerEarnings.platformFeeAmount",
    gstAmount: "providerEarnings.gstAmount",
    netAmount: "providerEarnings.netAmount",
    providerId: "providerEarnings.providerId",
  },
}));

const state = {
  paidBookings: [] as any[],
  lastWhere: null as any,
};

const queryBuilder: any = {
  from: vi.fn(() => queryBuilder),
  innerJoin: vi.fn(() => queryBuilder),
  where: vi.fn((arg: any) => {
    state.lastWhere = arg;
    return queryBuilder;
  }),
  orderBy: vi.fn(async () => state.paidBookings),
};

const dbMock = {
  select: vi.fn(() => queryBuilder),
};

vi.mock("@/lib/db", () => ({ db: dbMock }));

describe("admin fees providerSearch filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.lastWhere = null;
    state.paidBookings = [
      {
        id: "bk_1",
        status: "paid",
        updatedAt: new Date("2025-01-10T01:00:00.000Z"),
        priceAtBooking: 10000,
        serviceTitle: "Service",
        providerName: "Acme Co",
        customerEmail: "a@example.com",
      },
    ];
  });

  it("adds an ilike(provider.businessName, %search%) condition when providerSearch is provided", async () => {
    const { getAdminFeesReport } = await import("@/server/admin/fees");

    await getAdminFeesReport({
      from: "2025-01-01",
      to: "2025-01-31",
      providerSearch: "Acme",
    });

    expect(ilikeMock).toHaveBeenCalledTimes(1);
    expect(ilikeMock).toHaveBeenCalledWith("providers.businessName", "%Acme%");

    // Assert the composed WHERE includes the ilike condition.
    expect(state.lastWhere).toBeTruthy();
    expect(state.lastWhere.type).toBe("and");
    const hasIlike = (state.lastWhere.args ?? []).some((c: any) => c?.type === "ilike");
    expect(hasIlike).toBe(true);
  });

  it("does not add an ilike condition when providerSearch is empty", async () => {
    const { getAdminFeesReport } = await import("@/server/admin/fees");

    await getAdminFeesReport({ from: "2025-01-01", to: "2025-01-31", providerSearch: "" });

    expect(ilikeMock).not.toHaveBeenCalled();
    const hasIlike = (state.lastWhere?.args ?? []).some((c: any) => c?.type === "ilike");
    expect(hasIlike).toBe(false);
  });
});
