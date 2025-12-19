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
  if (plan === "pro") return process.env.STRIPE_PRICE_PRO_MONTHLY ?? null;
  if (plan === "elite") return process.env.STRIPE_PRICE_ELITE_MONTHLY ?? null;
  return null;
}

export function planFromStripePriceId(priceId: string | null | undefined): ProviderPlan | null {
  if (!priceId) return null;
  if (process.env.STRIPE_PRICE_PRO_MONTHLY && priceId === process.env.STRIPE_PRICE_PRO_MONTHLY) return "pro";
  if (process.env.STRIPE_PRICE_ELITE_MONTHLY && priceId === process.env.STRIPE_PRICE_ELITE_MONTHLY) return "elite";
  return null;
}
