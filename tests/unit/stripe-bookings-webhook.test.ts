import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as webhook } from "@/app/api/webhooks/stripe-bookings/route";
import { bookings } from "@/db/schema";

const stripeMocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: {
      constructEvent: stripeMocks.constructEvent,
    },
  },
}));

const dbMocks = vi.hoisted(() => {
  const state = {
    bookingStatus: "accepted" as string,
    paymentIntentId: null as string | null,
  };

  const findFirstBookings = vi.fn(async () => ({
    id: "bk_1",
    status: state.bookingStatus,
    paymentIntentId: state.paymentIntentId,
  }));

  const updateBookings = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: "bk_1", status: "paid", paymentIntentId: "pi_1" }])),
      })),
    })),
  }));

  return { state, findFirstBookings, updateBookings };
});

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      bookings: {
        findFirst: dbMocks.findFirstBookings,
      },
    },
    update: (table: any) => {
      if (table === bookings) return dbMocks.updateBookings();
      throw new Error("Unexpected table");
    },
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          leftJoin: () => ({
            where: () => ({
              then: async (cb: any) =>
                cb([
                  {
                    id: "bk_1",
                    providerId: "prov_1",
                    serviceId: "svc_1",
                    priceAtBooking: 10000,
                    serviceChargesGst: true,
                    providerChargesGst: true,
                    providerPlan: "starter",
                  },
                ]),
            }),
          }),
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: async () => undefined,
      }),
    }),
  },
}));

vi.mock("@/lib/provider-subscription", () => ({
  normalizeProviderPlan: (plan: unknown) => plan,
  getPlatformFeeBpsForPlan: () => 1000,
}));

vi.mock("@/lib/earnings", () => ({
  calculateEarnings: ({ amountInCents }: { amountInCents: number }) => ({
    grossAmount: amountInCents,
    platformFeeAmount: 1000,
    gstAmount: 0,
    netAmount: amountInCents - 1000,
  }),
}));

describe("POST /api/webhooks/stripe-bookings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_BOOKINGS_WEBHOOK_SECRET = "whsec_bookings";
    dbMocks.state.bookingStatus = "accepted";
    dbMocks.state.paymentIntentId = null;
  });

  it("returns 400 when signature missing", async () => {
    const req = new Request("http://localhost/api/webhooks/stripe-bookings", {
      method: "POST",
      body: "{}",
    });

    const res = await webhook(req);
    expect(res.status).toBe(400);
  });

  it("marks booking paid on checkout.session.completed (mode=payment)", async () => {
    stripeMocks.constructEvent.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "payment",
          metadata: { bookingId: "bk_1" },
          payment_intent: "pi_1",
        },
      },
    });

    const req = new Request("http://localhost/api/webhooks/stripe-bookings", {
      method: "POST",
      headers: { "stripe-signature": "sig" },
      body: "{}",
    });

    const res = await webhook(req);
    expect(res.status).toBe(200);
    expect(dbMocks.updateBookings).toHaveBeenCalledTimes(1);
  });

  it("marks booking paid on payment_intent.succeeded", async () => {
    stripeMocks.constructEvent.mockReturnValue({
      id: "evt_2",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_2",
          metadata: { bookingId: "bk_1" },
        },
      },
    });

    const req = new Request("http://localhost/api/webhooks/stripe-bookings", {
      method: "POST",
      headers: { "stripe-signature": "sig" },
      body: "{}",
    });

    const res = await webhook(req);
    expect(res.status).toBe(200);
    expect(dbMocks.updateBookings).toHaveBeenCalledTimes(1);
  });

  it("does not update on payment_intent.payment_failed", async () => {
    // The route intentionally links the PI even on payment_failed. Set existing PI to avoid an update.
    dbMocks.state.paymentIntentId = "pi_3";

    stripeMocks.constructEvent.mockReturnValue({
      id: "evt_3",
      type: "payment_intent.payment_failed",
      data: {
        object: {
          id: "pi_3",
          status: "requires_payment_method",
          metadata: { bookingId: "bk_1" },
        },
      },
    });

    const req = new Request("http://localhost/api/webhooks/stripe-bookings", {
      method: "POST",
      headers: { "stripe-signature": "sig" },
      body: "{}",
    });

    const res = await webhook(req);
    expect(res.status).toBe(200);
    expect(dbMocks.updateBookings).not.toHaveBeenCalled();
  });

  it("returns 500 on unexpected handler errors (so Stripe retries)", async () => {
    stripeMocks.constructEvent.mockReturnValue({
      id: "evt_500",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_500",
          metadata: { bookingId: "bk_1" },
        },
      },
    });

    dbMocks.updateBookings.mockImplementationOnce(() => {
      throw new Error("db down");
    });

    const req = new Request("http://localhost/api/webhooks/stripe-bookings", {
      method: "POST",
      headers: { "stripe-signature": "sig" },
      body: "{}",
    });

    const res = await webhook(req);
    expect(res.status).toBe(500);
  });
});
