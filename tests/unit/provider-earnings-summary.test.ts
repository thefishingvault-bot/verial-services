import { beforeEach, describe, expect, it, vi } from "vitest";

let selectCall = 0;
let payoutSumCents = 0;

vi.mock("@/lib/db", () => {
  const makeBuilder = (rows: unknown[]) => {
    const builder: any = {
      from: vi.fn(() => builder),
      leftJoin: vi.fn(() => builder),
      where: vi.fn(() => ({
        then: (fn: (rows: unknown[]) => unknown) => Promise.resolve(fn(rows)),
      })),
    };
    return builder;
  };

  return {
    db: {
      select: vi.fn(() => {
        selectCall += 1;

        // 1) earnedTotals
        if (selectCall === 1) {
          return makeBuilder([{ gross: 0, fee: 0, gst: 0, net: 0 }]);
        }

        // 2) last30EarnedTotals
        if (selectCall === 2) {
          return makeBuilder([{ gross: 0, fee: 0, gst: 0, net: 0 }]);
        }

        // 3) paidOutRow (provider payouts)
        if (selectCall === 3) {
          return makeBuilder([{ cents: payoutSumCents }]);
        }

        // 4) missingBookings
        return makeBuilder([
          {
            bookingId: "bk_1",
            priceAtBooking: 5000,
            paymentIntentId: "pi_1",
            bookingUpdatedAt: new Date(),
            serviceChargesGst: false,
            providerChargesGst: false,
            providerPlan: "pro",
          },
        ]);
      }),
    },
  };
});

import { getProviderEarningsSummary, getProviderMoneySummary } from "@/server/providers/earnings";

beforeEach(() => {
  selectCall = 0;
  payoutSumCents = 0;
});

describe("getProviderEarningsSummary", () => {
  it("treats paid bookings without earnings rows as earned and pending", async () => {
    const summary = await getProviderEarningsSummary("prov_1");

    // Fixture includes a Pro-plan booking; Pro has a 5% platform fee.
    // 5000 gross -> 250 fee -> 4750 net.
    expect(summary.lifetime.net).toBe(4750);
    expect(summary.last30.net).toBe(4750);
    expect(summary.paidOutNet).toBe(0);
    expect(summary.pendingPayoutsNet).toBe(4750);
  });
});

describe("getProviderMoneySummary", () => {
  it("uses Stripe payouts for paidOut and clamps pending to >= 0", async () => {
    payoutSumCents = 7000;

    const money = await getProviderMoneySummary("prov_1");

    // Fixture includes a Pro-plan booking; Pro has a 5% platform fee.
    expect(money.lifetimeEarnedNet).toBe(4750);
    expect(money.paidOutNet).toBe(7000);
    expect(money.pendingNet).toBe(0);
  });
});
