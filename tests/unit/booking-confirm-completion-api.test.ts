import { describe, it, expect, beforeEach, vi } from "vitest";

import { POST as confirmCompletion } from "@/app/api/bookings/[bookingId]/confirm-completion/route";
import { bookings, providerEarnings } from "@/db/schema";

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => Promise.resolve({ userId: "user_1" }),
}));

const stripeMocks = vi.hoisted(() => ({
  transfersCreate: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    transfers: {
      create: stripeMocks.transfersCreate,
    },
  },
}));

const dbMocks = vi.hoisted(() => {
  const findBooking = vi.fn();
  const findProvider = vi.fn();
  const findEarning = vi.fn();
  const findService = vi.fn();

  const updateProviderEarnings = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
  }));

  const updateBookings = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: "bk_1", status: "completed" }])),
      })),
    })),
  }));

  return {
    findBooking,
    findProvider,
    findEarning,
    findService,
    updateProviderEarnings,
    updateBookings,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      bookings: { findFirst: dbMocks.findBooking },
      providers: { findFirst: dbMocks.findProvider },
      providerEarnings: { findFirst: dbMocks.findEarning },
      services: { findFirst: dbMocks.findService },
    },
    update: (table: any) => {
      if (table === providerEarnings) return dbMocks.updateProviderEarnings();
      if (table === bookings) return dbMocks.updateBookings();
      throw new Error("Unexpected table passed to db.update");
    },
  },
}));

describe("POST /api/bookings/[bookingId]/confirm-completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.findService.mockResolvedValue({ chargesGst: true });
  });

  it("returns 409 when booking status is not completed_by_provider", async () => {
    dbMocks.findBooking.mockResolvedValue({ id: "bk_1", status: "paid", providerId: "prov_1" });

    const req = new Request("http://localhost/api/bookings/bk_1/confirm-completion", { method: "POST" });
    const res = await confirmCompletion(req, { params: Promise.resolve({ bookingId: "bk_1" }) });

    expect(res.status).toBe(409);
  });

  it("is idempotent when transfer already exists", async () => {
    dbMocks.findBooking.mockResolvedValue({ id: "bk_1", status: "completed_by_provider", providerId: "prov_1" });
    dbMocks.findProvider.mockResolvedValue({
      id: "prov_1",
      stripeConnectId: "acct_123",
      chargesGst: true,
      plan: "free",
      payoutsEnabled: true,
    });
    dbMocks.findEarning.mockResolvedValue({
      id: "earn_1",
      providerId: "prov_1",
      netAmount: 4500,
      status: "transferred",
      stripeTransferId: "tr_123",
    });

    const req = new Request("http://localhost/api/bookings/bk_1/confirm-completion", { method: "POST" });
    const res = await confirmCompletion(req, { params: Promise.resolve({ bookingId: "bk_1" }) });

    expect(res.status).toBe(200);
    expect(stripeMocks.transfersCreate).not.toHaveBeenCalled();

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.booking.status).toBe("completed");
  });

  it("creates a transfer when needed", async () => {
    dbMocks.findBooking.mockResolvedValue({ id: "bk_1", status: "completed_by_provider", providerId: "prov_1" });
    dbMocks.findProvider.mockResolvedValue({
      id: "prov_1",
      stripeConnectId: "acct_123",
      chargesGst: true,
      plan: "free",
      payoutsEnabled: true,
    });
    dbMocks.findEarning.mockResolvedValue({
      id: "earn_1",
      providerId: "prov_1",
      netAmount: 4500,
      status: "held",
      stripeTransferId: null,
    });

    stripeMocks.transfersCreate.mockResolvedValue({ id: "tr_new" });

    const req = new Request("http://localhost/api/bookings/bk_1/confirm-completion", { method: "POST" });
    const res = await confirmCompletion(req, { params: Promise.resolve({ bookingId: "bk_1" }) });

    expect(res.status).toBe(200);
    expect(stripeMocks.transfersCreate).toHaveBeenCalledTimes(1);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.transferId).toBe("tr_new");
    expect(json.booking.status).toBe("completed");
  });
});
