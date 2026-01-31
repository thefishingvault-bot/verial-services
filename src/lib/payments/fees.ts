export type BookingPaymentBreakdown = {
  currency: "nzd";
  /** Base service price in cents (P). */
  servicePriceCents: number;
  /** Customer-facing fee in cents. */
  serviceFeeCents: number;
  /** Total charged to customer in cents (P + fee). */
  totalCents: number;

  // Back-compat aliases for older callers.
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

function getCustomerServiceFeeBps(): number {
  // Default to 5% for the >= $20 tier.
  return Math.max(0, readIntEnv("CUSTOMER_SERVICE_FEE_BPS", 500));
}

function getCustomerServiceFeeFlatCents(): number {
  // Optional flat add-on.
  return Math.max(0, readIntEnv("CUSTOMER_SERVICE_FEE_FLAT_CENTS", 0));
}

function getCustomerServiceFeeMinCents(): number {
  return Math.max(0, readIntEnv("CUSTOMER_SERVICE_FEE_MIN_CENTS", 100));
}

function getCustomerServiceFeeMaxCents(): number {
  // Default cap: $15.00 NZD
  return Math.max(0, readIntEnv("CUSTOMER_SERVICE_FEE_MAX_CENTS", 1500));
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function calculateCustomerServiceFeeCents(params: {
  servicePriceCents: number;
  currency?: string;
}): number {
  const price = Math.max(0, Math.trunc(params.servicePriceCents));

  const currency = (params.currency ?? "nzd").toLowerCase();
  if (currency !== "nzd") {
    // NZD only for now. Keep behavior stable for other currencies by using the legacy env-driven fee.
    console.warn("[payments/fees] Non-NZD currency encountered; using legacy fee logic", { currency });
    const bps = Math.max(0, readIntEnv("CUSTOMER_SERVICE_FEE_BPS", 0));
    const flat = Math.max(0, readIntEnv("CUSTOMER_SERVICE_FEE_FLAT_CENTS", 0));
    const pct = Math.ceil((price * bps) / 10000);
    return Math.max(0, pct + flat);
  }

  // Tiered small-order fees (NZD only for now)
  // P < $10  -> $3
  // P < $20  -> $5
  // P >= $20 -> clamp(round(P * 5%), min $1, max $15) (env-adjustable)
  if (price > 0 && price < 1000) return 300;
  if (price > 0 && price < 2000) return 500;

  const bps = getCustomerServiceFeeBps();
  const flat = getCustomerServiceFeeFlatCents();
  const min = getCustomerServiceFeeMinCents();
  const max = getCustomerServiceFeeMaxCents();

  const pct = Math.round((price * bps) / 10000);
  const combined = pct + flat;
  return clampInt(combined, min, max);
}

export function calculateBookingPaymentBreakdown(params: {
  servicePriceCents: number;
  currency?: string;
}): BookingPaymentBreakdown {
  const servicePriceCents = Math.max(0, Math.trunc(params.servicePriceCents));
  const serviceFeeCents = calculateCustomerServiceFeeCents({
    servicePriceCents,
    currency: params.currency,
  });
  const totalCents = servicePriceCents + serviceFeeCents;

  return {
    currency: "nzd",
    servicePriceCents,
    serviceFeeCents,
    totalCents,

    bookingBaseAmountCents: servicePriceCents,
    customerServiceFeeCents: serviceFeeCents,
    totalChargeCents: totalCents,
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
