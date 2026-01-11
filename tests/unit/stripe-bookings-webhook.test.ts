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
  const updateBookings = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: "bk_1", status: "paid", paymentIntentId: "pi_1" }])),
      })),
    })),
  }));

  return { updateBookings };
});

vi.mock("@/lib/db", () => ({
  db: {
    update: (table: any) => {
      if (table === bookings) return dbMocks.updateBookings();
      throw new Error("Unexpected table");
    },
  },
}));

describe("POST /api/webhooks/stripe-bookings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_BOOKINGS_WEBHOOK_SECRET = "whsec_bookings";
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
});
