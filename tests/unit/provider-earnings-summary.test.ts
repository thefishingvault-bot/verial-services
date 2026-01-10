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

        // 1) paidOutTotals
        if (selectCall === 1) {
          return makeBuilder([{ gross: 0, fee: 0, gst: 0, net: 0 }]);
        }

        // 2) last30PaidOutTotals
        if (selectCall === 2) {
          return makeBuilder([{ gross: 0, fee: 0, gst: 0, net: 0 }]);
        }

        // 3) pendingFromEarningsRow
        if (selectCall === 3) {
          return makeBuilder([{ net: 0 }]);
        }

        // 4) last30PendingFromEarningsRow
        if (selectCall === 4) {
          return makeBuilder([{ net: 0 }]);
        }

        // 6) getProviderMoneySummary: sum provider payouts
        if (selectCall === 6) {
          return makeBuilder([{ cents: payoutSumCents }]);
        }

        // 5) missingBookings
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
  it("treats completed unpaid-out bookings as pending when earnings rows are missing", async () => {
    const summary = await getProviderEarningsSummary("prov_1");

    expect(summary.lifetime.net).toBe(5000);
    expect(summary.last30.net).toBe(5000);
    expect(summary.paidOutNet).toBe(0);
    expect(summary.pendingPayoutsNet).toBe(5000);
  });
});

describe("getProviderMoneySummary", () => {
  it("uses Stripe payouts for paidOut and clamps pending to >= 0", async () => {
    payoutSumCents = 7000;

    const money = await getProviderMoneySummary("prov_1");

    expect(money.lifetimeEarnedNet).toBe(5000);
    expect(money.paidOutNet).toBe(7000);
    expect(money.pendingNet).toBe(0);
  });
});
