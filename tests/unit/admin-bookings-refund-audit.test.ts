import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("drizzle-orm", () => ({
  eq: (left: any, right: any) => ({ type: "eq", args: [left, right] }),
}));

const requireAdminMock = vi.fn();
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: requireAdminMock }));

const writeAdminAuditLogMock = vi.fn();
vi.mock("@/lib/admin-audit", () => ({ writeAdminAuditLog: writeAdminAuditLogMock }));

const createMarketplaceRefundMock = vi.fn();
vi.mock("@/lib/stripe-refunds", () => ({ createMarketplaceRefund: createMarketplaceRefundMock }));

vi.mock("@/lib/validation/admin", () => ({
  BookingIdSchema: {},
  RefundCreateSchema: {},
  RefundQuerySchema: {},
  invalidResponse: (err: any) => new Response(String(err), { status: 400 }),
  parseBody: async (_schema: any, _req: any) => ({
    ok: true,
    data: {
      bookingId: "book_1",
      amount: 5000,
      reason: "admin_adjustment",
      description: "test",
    },
  }),
  parseQuery: () => ({ ok: true, data: { bookingId: "book_1" } }),
  parseParams: (_schema: any, data: any) => ({ ok: true, data }),
}));

vi.mock("@/db/schema", () => ({
  bookings: {
    id: "bookings.id",
    priceAtBooking: "bookings.priceAtBooking",
    paymentIntentId: "bookings.paymentIntentId",
    status: "bookings.status",
    providerId: "bookings.providerId",
  },
  refunds: {
    id: "refunds.id",
    processedBy: "refunds.processedBy",
    createdAt: "refunds.createdAt",
  },
  users: {
    id: "users.id",
    firstName: "users.firstName",
    lastName: "users.lastName",
  },
}));

const state = {
  bookingRow: [] as any[],
};

const dbMock = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => state.bookingRow),
      })),
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(async () => []),
        })),
      })),
    })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(async () => undefined),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(async () => undefined),
    })),
  })),
};

vi.mock("@/lib/db", () => ({ db: dbMock }));

describe("admin booking refund audit logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({ isAdmin: true, userId: "admin_1" });
    state.bookingRow = [
      {
        id: "book_1",
        priceAtBooking: 10000,
        paymentIntentId: "pi_123",
        status: "paid",
        providerId: "prov_1",
      },
    ];
    createMarketplaceRefundMock.mockResolvedValue({
      refund: { id: "re_123", status: "succeeded" },
      refundedPlatformFee: 500,
      refundedProviderAmount: 4500,
    });
  });

  it("writes an admin audit log on successful refund", async () => {
    const { POST } = await import("@/app/api/admin/bookings/[bookingId]/refunds/route");

    const res = await POST(
      new NextRequest("http://localhost/api/admin/bookings/book_1/refunds", { method: "POST" }),
    );

    expect(res.status).toBe(200);
    expect(writeAdminAuditLogMock).toHaveBeenCalledTimes(1);

    const call = writeAdminAuditLogMock.mock.calls[0]?.[0];
    expect(call.action).toBe("BOOKING_REFUND");
    expect(call.resource).toBe("booking");
    expect(call.resourceId).toBe("book_1");
  });
});
