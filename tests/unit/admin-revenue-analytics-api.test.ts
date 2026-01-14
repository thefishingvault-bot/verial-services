import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireAdminMock = vi.fn();
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: requireAdminMock }));

const andMock = vi.fn((...args: any[]) => ({ type: "and", args }));
const inArrayMock = vi.fn((...args: any[]) => ({ type: "inArray", args }));

const sqlMock: any = (strings: any, ...values: any[]) => {
  const base = {
    type: "sql",
    strings,
    values,
    alias: undefined as string | undefined,
    as(alias: string) {
      return { ...base, alias };
    },
  };
  return base;
};
sqlMock.raw = (value: string) => ({ type: "raw", value });

vi.mock("drizzle-orm", () => ({
  and: (...args: any[]) => andMock(...args),
  desc: (arg: any) => ({ type: "desc", args: [arg] }),
  eq: (left: any, right: any) => ({ type: "eq", args: [left, right] }),
  gte: (left: any, right: any) => ({ type: "gte", args: [left, right] }),
  lt: (left: any, right: any) => ({ type: "lt", args: [left, right] }),
  inArray: (...args: any[]) => inArrayMock(...args),
  sql: sqlMock,
}));

const schemaTokens = {
  bookings: {
    id: "bookings.id",
    createdAt: "bookings.createdAt",
    priceAtBooking: "bookings.priceAtBooking",
    status: "bookings.status",
    serviceId: "bookings.serviceId",
    providerId: "bookings.providerId",
    userId: "bookings.userId",
  },
  refunds: {
    bookingId: "refunds.bookingId",
    amount: "refunds.amount",
  },
  services: {
    id: "services.id",
    category: "services.category",
  },
  providers: {
    id: "providers.id",
    userId: "providers.userId",
    businessName: "providers.businessName",
    trustLevel: "providers.trustLevel",
    baseRegion: "providers.baseRegion",
  },
  users: {
    id: "users.id",
    firstName: "users.firstName",
    lastName: "users.lastName",
  },
};

vi.mock("@/db/schema", () => schemaTokens);

const state = {
  whereArgs: [] as any[],
  leftJoins: [] as any[],
  selects: [] as any[],
};

const FIXTURE = {
  bookingGross: 10000,
  refunds: [1000, 500],
};

function containsType(node: any, type: string): boolean {
  if (!node || typeof node !== "object") return false;
  if (node.type === type) return true;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      if (value.some((v) => containsType(v, type))) return true;
      continue;
    }
    if (containsType(value, type)) return true;
  }
  return false;
}

function computeAggregate(joinedRefundsDirectly: boolean) {
  const refundCount = FIXTURE.refunds.length;
  const totalRefunds = FIXTURE.refunds.reduce((sum, v) => sum + v, 0);
  const gross = joinedRefundsDirectly ? FIXTURE.bookingGross * refundCount : FIXTURE.bookingGross;

  const bps = Number.parseInt(process.env.PLATFORM_FEE_BPS || "1000", 10);
  const perBookingFee = Math.ceil((FIXTURE.bookingGross * bps) / 10000);
  const fee = joinedRefundsDirectly ? perBookingFee * refundCount : perBookingFee;

  return { gross, totalRefunds, fee };
}

function makeBuilder(selection: any) {
  state.selects.push(selection);

  const ctx = {
    joins: [] as any[],
  };

  const builder: any = {
    from: vi.fn(() => builder),
    innerJoin: vi.fn(() => builder),
    leftJoin: vi.fn((table: any) => {
      ctx.joins.push(table);
      state.leftJoins.push(table);
      return builder;
    }),
    where: vi.fn((arg: any) => {
      state.whereArgs.push(arg);
      return builder;
    }),
    groupBy: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    as: vi.fn((alias: string) => ({ __alias: alias, ...selection })),
    then: (resolve: any, reject: any) => {
      const joinedRefundsDirectly = ctx.joins.includes(schemaTokens.refunds);
      const { gross, totalRefunds, fee } = computeAggregate(joinedRefundsDirectly);

      const keys = Object.keys(selection ?? {});
      let result: any;

      if (keys.includes("period")) {
        result = [
          {
            period: new Date("2025-01-01T00:00:00.000Z").toISOString(),
            totalRevenue: gross,
            bookingCount: 1,
            avgBookingValue: gross,
            platformFees: fee,
            refunds: totalRefunds,
          },
        ];
      } else if (keys.includes("totalRefunds")) {
        result = [
          {
            totalRevenue: gross,
            totalBookings: 1,
            avgBookingValue: gross,
            totalPlatformFees: fee,
            totalRefunds,
            uniqueCustomers: 1,
            uniqueProviders: 1,
          },
        ];
      } else if (keys.includes("category")) {
        result = [];
      } else if (keys.includes("providerId") && keys.includes("providerName")) {
        result = [];
      } else if (keys.includes("region")) {
        result = [];
      } else if (keys.includes("totalRevenue") && keys.includes("totalBookings")) {
        result = [{ totalRevenue: gross, totalBookings: 1 }];
      } else {
        result = [];
      }

      return Promise.resolve(result).then(resolve, reject);
    },
  };

  return builder;
}

const dbMock = {
  select: vi.fn((selection: any) => makeBuilder(selection)),
};

vi.mock("@/lib/db", () => ({ db: dbMock }));

beforeEach(() => {
  vi.clearAllMocks();
  state.whereArgs = [];
  state.leftJoins = [];
  state.selects = [];

  process.env.PLATFORM_FEE_BPS = "1000";

  requireAdminMock.mockResolvedValue({ isAdmin: true, userId: "admin_1" });
});

describe("/api/admin/revenue-analytics", () => {
  it("returns 400 for invalid groupBy", async () => {
    const { GET } = await import("@/app/api/admin/revenue-analytics/route");

    const res = await GET(
      new NextRequest("http://localhost/api/admin/revenue-analytics?timeframe=30d&groupBy=quarter") as any,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Invalid request" });
  });

  it("does not multiply gross revenue when a booking has multiple refunds", async () => {
    const { GET } = await import("@/app/api/admin/revenue-analytics/route");

    const res = await GET(
      new NextRequest("http://localhost/api/admin/revenue-analytics?timeframe=30d&groupBy=day") as any,
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    // booking A: $100 with two refunds $10 and $5
    expect(body.overallStats.totalRevenue).toBe(10000);
    expect(body.overallStats.totalRefunds).toBe(1500);
    expect(body.overallStats.totalPlatformFees).toBe(1000);

    expect(body.revenueTrends[0].totalRevenue).toBe(10000);
    expect(body.revenueTrends[0].refunds).toBe(1500);

    // Ensure we did NOT join refunds directly (must use aggregated refunds-per-booking subquery).
    expect(state.leftJoins).not.toContain(schemaTokens.refunds);

    // Ensure every query's WHERE includes the booking status filter.
    expect(state.whereArgs.length).toBeGreaterThanOrEqual(1);
    for (const arg of state.whereArgs) {
      expect(containsType(arg, "inArray")).toBe(true);
    }
  });

  it("uses a safe date_trunc unit mapping (not raw query input)", async () => {
    const { GET } = await import("@/app/api/admin/revenue-analytics/route");

    await GET(new NextRequest("http://localhost/api/admin/revenue-analytics?timeframe=30d&groupBy=day") as any);

    const trendSelect = state.selects.find((s) => s && Object.prototype.hasOwnProperty.call(s, "period"));
    expect(trendSelect).toBeTruthy();

    const periodSql = trendSelect.period;
    expect(periodSql?.type).toBe("sql");

    // The first value should be a raw literal like `'day'`, coming from a safe mapping.
    expect(periodSql.values?.[0]).toMatchObject({ type: "raw", value: "'day'" });
  });
});
