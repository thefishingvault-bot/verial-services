import { describe, it, expect } from "vitest";
import { calculateBookingTotals } from "@/lib/invoices/totals";

describe("calculateBookingTotals", () => {
  it("calculates GST-inclusive totals", () => {
    const totals = calculateBookingTotals({ priceInCents: 10000, chargesGst: true });
    expect(totals.gross).toBe(10000);
    expect(totals.gstAmount).toBeGreaterThan(0);
    expect(totals.totalPaid).toBe(10000);
  });

  it("handles no GST providers", () => {
    const totals = calculateBookingTotals({ priceInCents: 10000, chargesGst: false });
    expect(totals.gstAmount).toBe(0);
  });

  it("subtracts refunds", () => {
    const totals = calculateBookingTotals({ priceInCents: 15000, chargesGst: true, refundedAmountInCents: 5000 });
    expect(totals.refundedAmount).toBe(5000);
    expect(totals.totalPaid).toBe(10000);
  });
});
