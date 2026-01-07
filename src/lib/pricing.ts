import { formatPrice } from "@/lib/utils";

export type ServicePricingType = "fixed" | "from" | "quote";

export function formatServicePriceLabel(params: {
  pricingType: ServicePricingType;
  priceInCents: number | null;
}): string {
  const { pricingType, priceInCents } = params;

  if (pricingType === "quote") return "Quote required";

  const amount = typeof priceInCents === "number" && Number.isFinite(priceInCents) ? priceInCents : null;
  if (amount == null) return "—";

  const formatted = formatPrice(amount);
  return pricingType === "from" ? `From ${formatted}` : formatted;
}

export function formatBookingPriceLabel(priceAtBookingInCents: number): string {
  // Convention: 0 means "quote requested / price TBD".
  if (!priceAtBookingInCents) return "Quote requested";
  return formatPrice(priceAtBookingInCents);
}
