export type ProviderPlan = "starter" | "pro" | "elite";

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

export function planFromStripePriceId(priceId: string | null | undefined): ProviderPlan | null {
  if (!priceId) return null;
  const pro = process.env.STRIPE_PRICE_PRO_MONTHLY ?? process.env.STRIPE_PRICE_PRO;
  const elite = process.env.STRIPE_PRICE_ELITE_MONTHLY ?? process.env.STRIPE_PRICE_ELITE;
  if (pro && priceId === pro) return "pro";
  if (elite && priceId === elite) return "elite";
  return null;
}
