import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => {
  let call = 0;

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
        call += 1;

        // 1) paidOutTotals
        if (call === 1) {
          return makeBuilder([{ gross: 0, fee: 0, gst: 0, net: 0 }]);
        }

        // 2) last30PaidOutTotals
        if (call === 2) {
          return makeBuilder([{ gross: 0, fee: 0, gst: 0, net: 0 }]);
        }

        // 3) pendingFromEarningsRow
        if (call === 3) {
          return makeBuilder([{ net: 0 }]);
        }

        // 4) last30PendingFromEarningsRow
        if (call === 4) {
          return makeBuilder([{ net: 0 }]);
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

import { getProviderEarningsSummary } from "@/server/providers/earnings";

describe("getProviderEarningsSummary", () => {
  it("treats completed unpaid-out bookings as pending when earnings rows are missing", async () => {
    const summary = await getProviderEarningsSummary("prov_1");

    expect(summary.lifetime.net).toBe(5000);
    expect(summary.last30.net).toBe(5000);
    expect(summary.paidOutNet).toBe(0);
    expect(summary.pendingPayoutsNet).toBe(5000);
  });
});
