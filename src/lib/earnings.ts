const DEFAULT_PLATFORM_FEE_BPS = parseInt(process.env.PLATFORM_FEE_BPS || "1000", 10);
const DEFAULT_GST_BPS = parseInt(process.env.GST_BPS || "1500", 10); // 15% GST

type EarningsInput = {
  amountInCents: number;
  chargesGst: boolean;
  platformFeeBps?: number;
  gstBps?: number;
};

export type EarningsBreakdown = {
  grossAmount: number;
  platformFeeAmount: number;
  gstAmount: number;
  netAmount: number;
};

function assertNonNegative(value: number, label: string) {
  if (value < 0) {
    throw new Error(`${label} cannot be negative`);
  }
}

export function calculateEarnings(input: EarningsInput): EarningsBreakdown {
  const {
    amountInCents,
    chargesGst,
    platformFeeBps = DEFAULT_PLATFORM_FEE_BPS,
    gstBps = DEFAULT_GST_BPS,
  } = input;

  assertNonNegative(amountInCents, "amountInCents");
  assertNonNegative(platformFeeBps, "platformFeeBps");
  assertNonNegative(gstBps, "gstBps");

  const platformFeeAmount = Math.ceil((amountInCents * platformFeeBps) / 10000);

  // If the price is GST-inclusive, the GST component is amount * rate / (1 + rate).
  const gstAmount = chargesGst
    ? Math.round((amountInCents * gstBps) / (10000 + gstBps))
    : 0;

  const netAmount = amountInCents - platformFeeAmount - gstAmount;

  if (netAmount < 0) {
    throw new Error("Net amount would be negative after fees and GST");
  }

  return {
    grossAmount: amountInCents,
    platformFeeAmount,
    gstAmount,
    netAmount,
  };
}
