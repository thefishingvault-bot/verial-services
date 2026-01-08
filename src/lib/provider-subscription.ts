export type ProviderPlan = "starter" | "pro" | "elite";

export function isStripeSubscribedStatus(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

export function isStripeNotSubscribedStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return (
    status === "canceled" ||
    status === "incomplete" ||
    status === "incomplete_expired" ||
    status === "past_due" ||
    status === "unpaid" ||
    status === "paused"
  );
}

export function normalizeProviderPlan(value: unknown): ProviderPlan {
  if (value === "pro" || value === "elite") return value;
  return "starter";
}

export function getPlatformFeeBpsForPlan(plan: ProviderPlan): number {
  // Default is 10% (1000 bps), configurable.
  const starterBps = Number.parseInt(process.env.PLATFORM_FEE_BPS || "1000", 10);
  if (plan === "starter") return Number.isFinite(starterBps) ? starterBps : 1000;

  // Pro/Elite: no per-booking platform fee by default.
  return 0;
}

export function getStripePriceIdForPlan(plan: ProviderPlan): string | null {
  if (plan === "pro") return process.env.STRIPE_PRICE_PRO_MONTHLY ?? process.env.STRIPE_PRICE_PRO ?? null;
  if (plan === "elite") return process.env.STRIPE_PRICE_ELITE_MONTHLY ?? process.env.STRIPE_PRICE_ELITE ?? null;
  return null;
}

export function getStripeLookupKeyForPlan(plan: ProviderPlan): string | null {
  if (plan === "pro") return process.env.STRIPE_LOOKUP_KEY_PRO_MONTHLY ?? "verial_pro_monthly";
  if (plan === "elite") return process.env.STRIPE_LOOKUP_KEY_ELITE_MONTHLY ?? "verial_elite_monthly";
  return null;
}

export function getStripeProductIdForPlan(plan: ProviderPlan): string | null {
  if (plan === "pro") return process.env.STRIPE_PRODUCT_PRO ?? null;
  if (plan === "elite") return process.env.STRIPE_PRODUCT_ELITE ?? null;
  if (plan === "starter") return process.env.STRIPE_PRODUCT_STARTER ?? null;
  return null;
}

export function planFromStripePriceId(priceId: string | null | undefined): ProviderPlan | null {
  if (!priceId) return null;
  const pro = process.env.STRIPE_PRICE_PRO_MONTHLY ?? process.env.STRIPE_PRICE_PRO;
  const elite = process.env.STRIPE_PRICE_ELITE_MONTHLY ?? process.env.STRIPE_PRICE_ELITE;
  if (pro && priceId === pro) return "pro";
  if (elite && priceId === elite) return "elite";
  return null;
}

export function resolvePlanFromStripePrice(params: {
  priceId: string | null | undefined;
  priceLookupKey?: string | null | undefined;
}): ProviderPlan | null {
  const byId = planFromStripePriceId(params.priceId);
  if (byId) return byId;

  const lookupKey = params.priceLookupKey ?? null;
  if (!lookupKey) return null;

  // Default lookup keys, overridable via env vars.
  const proKey = process.env.STRIPE_LOOKUP_KEY_PRO_MONTHLY ?? "verial_pro_monthly";
  const eliteKey = process.env.STRIPE_LOOKUP_KEY_ELITE_MONTHLY ?? "verial_elite_monthly";

  if (lookupKey === eliteKey) return "elite";
  if (lookupKey === proKey) return "pro";
  return null;
}
