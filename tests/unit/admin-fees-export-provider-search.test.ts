import { beforeEach, describe, expect, it, vi } from "vitest";

const ilikeMock = vi.fn((column: any, pattern: any) => ({ type: "ilike", args: [column, pattern] }));
const eqMock = vi.fn((left: any, right: any) => ({ type: "eq", args: [left, right] }));

vi.mock("drizzle-orm", () => ({
  and: (...conditions: any[]) => ({ type: "and", args: conditions }),
  between: (...args: any[]) => ({ type: "between", args }),
  desc: (column: any) => ({ type: "desc", args: [column] }),
  eq: (left: any, right: any) => eqMock(left, right),
  ilike: (column: any, pattern: any) => ilikeMock(column, pattern),
  inArray: (...args: any[]) => ({ type: "inArray", args }),
  sql: (strings: any, ...values: any[]) => ({ type: "sql", strings, values }),
}));

const requireAdminMock = vi.fn();
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: requireAdminMock }));

vi.mock("@/db/schema", () => ({
  bookings: {
    updatedAt: "bookings.updatedAt",
    status: "bookings.status",
    providerId: "bookings.providerId",
    priceAtBooking: "bookings.priceAtBooking",
  },
  providers: {
    id: "providers.id",
    businessName: "providers.businessName",
  },
}));

const state = {
  lastWhere: null as any,
  rows: [] as any[],
};

const queryBuilder: any = {
  from: vi.fn(() => queryBuilder),
  leftJoin: vi.fn(() => queryBuilder),
  where: vi.fn((arg: any) => {
    state.lastWhere = arg;
    return queryBuilder;
  }),
  groupBy: vi.fn(() => queryBuilder),
  orderBy: vi.fn(async () => state.rows),
};

const dbMock = {
  select: vi.fn(() => queryBuilder),
};

vi.mock("@/lib/db", () => ({ db: dbMock }));

describe("admin fees export by-provider providerSearch parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({ isAdmin: true, userId: "admin_1" });
    state.lastWhere = null;
    state.rows = [
      {
        providerId: "prov_1",
        providerName: "Acme Co",
        totalGross: 10000,
        totalFee: 1000,
        totalGst: 150,
      },
    ];
  });

  it("filters export by providerSearch (name substring) and does not use providerId equality", async () => {
    const { GET } = await import("@/app/api/admin/fees/by-provider/route");

    const res = await GET(
      new Request(
        "http://localhost/api/admin/fees/by-provider?from=2025-01-01&to=2025-01-31&providerSearch=Acme&format=csv",
      ),
    );

    expect(res.status).toBe(200);
    expect(ilikeMock).toHaveBeenCalledTimes(1);
    expect(ilikeMock).toHaveBeenCalledWith("providers.businessName", "%Acme%");

    // Regression guard: export should NOT filter by providerId for name search.
    expect(eqMock).not.toHaveBeenCalledWith("bookings.providerId", "Acme");

    const text = await res.text();
    expect(text).toContain("providerId,providerName,totalGross,totalFee,totalNet");
    expect(text).toContain("prov_1,Acme Co,10000,1000,8850");

    expect(res.headers.get("Content-Type")).toBe("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("attachment;");
  });
});
