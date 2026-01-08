import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as stripeWebhook } from "@/app/api/stripe/webhook/route";
import { NextRequest } from "next/server";
import * as dbMod from "@/lib/db";
import { bookings, providerEarnings } from "@/db/schema";
import { stripe } from "@/lib/stripe";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { clerkClient } from "@clerk/nextjs/server";

vi.mock("@/lib/stripe", () => {
  const constructEvent = vi.fn();
  const paymentIntents = { retrieve: vi.fn() };
  return {
    stripe: {
      webhooks: { constructEvent },
      paymentIntents,
      subscriptions: { retrieve: vi.fn() },
      customers: { create: vi.fn(), search: vi.fn() },
      prices: { list: vi.fn(), retrieve: vi.fn() },
      checkout: { sessions: { create: vi.fn() } },
    },
    detectStripeMode: () => "test",
    retrieveStripePriceSafe: vi.fn(async () => null),
  };
});

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(() =>
    Promise.resolve({
      users: {
        getUser: vi.fn().mockResolvedValue({
          emailAddresses: [{ emailAddress: "user@test.com" }],
        }),
      },
    }),
  ),
  auth: () => Promise.resolve({ userId: "user_123" }),
  currentUser: () => Promise.resolve(null),
}));

vi.mock("next/headers", () => ({
  headers: () => ({ get: () => "sig" }),
}));

describe("stripe webhook", () => {
  const bookingFindFirst = vi.fn();
  const updateBookingsWhere = vi.fn();
  const updateBookingsSet = vi.fn(() => ({ where: updateBookingsWhere }));
  const updateEarningsWhere = vi.fn();
  const updateEarningsSet = vi.fn(() => ({ where: updateEarningsWhere }));

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

    bookingFindFirst.mockReset();
    updateBookingsWhere.mockReset();
    updateBookingsSet.mockReset();
    updateEarningsWhere.mockReset();
    updateEarningsSet.mockReset();

    vi.spyOn(dbMod, "db", "get").mockReturnValue({
      query: { bookings: { findFirst: bookingFindFirst } },
      update: (table: any) => {
        if (table === bookings) return { set: updateBookingsSet } as any;
        if (table === providerEarnings) return { set: updateEarningsSet } as any;
        return { set: vi.fn(() => ({ where: vi.fn() })) } as any;
      },
    } as any);
  });

  it("handles payment failures by clearing PI and notifying customer", async () => {
    bookingFindFirst.mockResolvedValue({
      id: "bk_1",
      status: "accepted",
      service: { title: "Test Service" },
      provider: { userId: "prov_user" },
      userId: "user_1",
      paymentIntentId: "pi_1",
    });

    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: "payment_intent.payment_failed",
      data: {
        object: {
          id: "pi_1",
          metadata: { bookingId: "bk_1", userId: "user_1" },
        },
      },
    } as any);

    const req = new NextRequest("http://localhost/api/stripe/webhook", {
      method: "POST",
      body: "{}",
    });

    const res = await stripeWebhook(req);
    expect(res.status).toBe(200);
    expect(updateBookingsSet).toHaveBeenCalledWith(
      expect.objectContaining({ paymentIntentId: null }),
    );
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_1", title: "Payment failed" }),
    );
    expect(sendEmail).toHaveBeenCalled();
  });

  it("marks refunds and updates earnings", async () => {
    bookingFindFirst.mockResolvedValue({
      id: "bk_2",
      status: "paid",
      userId: "user_2",
      provider: { userId: "prov_user" },
      service: { title: "Refunded Service" },
    });

    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: "charge.refunded",
      data: {
        object: { payment_intent: "pi_2" },
      },
    } as any);

    vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({
      id: "pi_2",
      metadata: { bookingId: "bk_2" },
    } as any);

    const req = new NextRequest("http://localhost/api/stripe/webhook", {
      method: "POST",
      body: "{}",
    });

    const res = await stripeWebhook(req);
    expect(res.status).toBe(200);
    expect(updateBookingsSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "refunded" }),
    );
    expect(updateEarningsSet).toHaveBeenCalled();
  });
});
