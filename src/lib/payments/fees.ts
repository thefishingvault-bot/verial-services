export type BookingPaymentBreakdown = {
  currency: "nzd";
  bookingBaseAmountCents: number;
  customerServiceFeeCents: number;
  totalChargeCents: number;
};

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getMinimumBookingAmountCents(): number {
  // Defaults to $1.00 NZD to match existing validation.
  return Math.max(0, readIntEnv("MIN_BOOKING_AMOUNT_CENTS", 100));
}

export function getCustomerServiceFeeBps(): number {
  return Math.max(0, readIntEnv("CUSTOMER_SERVICE_FEE_BPS", 0));
}

export function getCustomerServiceFeeFlatCents(): number {
  return Math.max(0, readIntEnv("CUSTOMER_SERVICE_FEE_FLAT_CENTS", 0));
}

export function calculateCustomerServiceFeeCents(params: {
  bookingBaseAmountCents: number;
}): number {
  const base = Math.max(0, Math.trunc(params.bookingBaseAmountCents));

  const bps = getCustomerServiceFeeBps();
  const flat = getCustomerServiceFeeFlatCents();

  // Use ceil to avoid under-collecting at small amounts.
  const pct = Math.ceil((base * bps) / 10000);
  return Math.max(0, pct + flat);
}

export function calculateBookingPaymentBreakdown(params: {
  bookingBaseAmountCents: number;
}): BookingPaymentBreakdown {
  const bookingBaseAmountCents = Math.max(0, Math.trunc(params.bookingBaseAmountCents));
  const customerServiceFeeCents = calculateCustomerServiceFeeCents({ bookingBaseAmountCents });
  const totalChargeCents = bookingBaseAmountCents + customerServiceFeeCents;

  return {
    currency: "nzd",
    bookingBaseAmountCents,
    customerServiceFeeCents,
    totalChargeCents,
  };
}

export function parseStripeMetadataInt(metadata: unknown, key: string): number | null {
  if (!metadata || typeof metadata !== "object") return null;
  const record = metadata as Record<string, unknown>;
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value !== "string") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}
