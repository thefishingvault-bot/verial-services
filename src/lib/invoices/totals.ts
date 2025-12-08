import { calculateEarnings } from "@/lib/earnings";

export type BookingTotals = {
  gross: number;
  platformFee: number;
  gstAmount: number;
  netToProvider: number;
  totalPaid: number;
  refundedAmount: number;
};

export function calculateBookingTotals(params: {
  priceInCents: number;
  chargesGst: boolean;
  refundedAmountInCents?: number;
  platformFeeBps?: number;
  gstBps?: number;
}): BookingTotals {
  const gross = Math.max(0, Math.trunc(params.priceInCents));
  const refundedAmount = Math.max(0, Math.trunc(params.refundedAmountInCents ?? 0));

  const earnings = calculateEarnings({
    amountInCents: gross,
    chargesGst: !!params.chargesGst,
    platformFeeBps: params.platformFeeBps,
    gstBps: params.gstBps,
  });

  const totalPaid = Math.max(0, gross - refundedAmount);
  const netToProvider = Math.max(0, earnings.netAmount - refundedAmount);

  return {
    gross,
    platformFee: earnings.platformFeeAmount,
    gstAmount: earnings.gstAmount,
    netToProvider,
    totalPaid,
    refundedAmount,
  };
}
