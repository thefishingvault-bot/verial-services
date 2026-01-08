export type ProviderPlan = "starter" | "pro" | "elite" | "unknown";

export type StripeMode = "test" | "live";

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
  if (value === "pro" || value === "elite" || value === "unknown") return value;
  return "starter";
}

export function getPlatformFeeBpsForPlan(plan: ProviderPlan): number {
  // Default is 10% (1000 bps), configurable.
  const starterBps = Number.parseInt(process.env.PLATFORM_FEE_BPS || "1000", 10);
  if (plan === "starter" || plan === "unknown") return Number.isFinite(starterBps) ? starterBps : 1000;

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

export function getExpectedStripePriceIds(params: { mode: StripeMode }): {
  pro: string | null;
  elite: string | null;
  source: "mode_env" | "legacy_env" | "none";
} {
  const { mode } = params;

  // New, explicit mode-aware env vars (requested).
  const proMode =
    mode === "test"
      ? process.env.STRIPE_PRO_PRICE_ID_TEST
      : process.env.STRIPE_PRO_PRICE_ID_LIVE;
  const eliteMode =
    mode === "test"
      ? process.env.STRIPE_ELITE_PRICE_ID_TEST
      : process.env.STRIPE_ELITE_PRICE_ID_LIVE;

  if (proMode || eliteMode) {
    return { pro: proMode ?? null, elite: eliteMode ?? null, source: "mode_env" };
  }

  // Back-compat: existing env vars used across environments.
  const proLegacy = process.env.STRIPE_PRICE_PRO_MONTHLY ?? process.env.STRIPE_PRICE_PRO ?? null;
  const eliteLegacy = process.env.STRIPE_PRICE_ELITE_MONTHLY ?? process.env.STRIPE_PRICE_ELITE ?? null;
  if (proLegacy || eliteLegacy) {
    return { pro: proLegacy, elite: eliteLegacy, source: "legacy_env" };
  }

  return { pro: null, elite: null, source: "none" };
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
  const lookupKey = params.priceLookupKey ?? null;
  // A) lookup_key first (requested)
  if (lookupKey) {
    const proKey = process.env.STRIPE_LOOKUP_KEY_PRO_MONTHLY ?? "verial_pro_monthly";
    const eliteKey = process.env.STRIPE_LOOKUP_KEY_ELITE_MONTHLY ?? "verial_elite_monthly";
    if (lookupKey === eliteKey) return "elite";
    if (lookupKey === proKey) return "pro";
  }

  // B) price.id via legacy mapping (kept for older setups)
  const byId = planFromStripePriceId(params.priceId);
  if (byId) return byId;

  return null;
}

export type PricePlanResolution = {
  plan: ProviderPlan;
  source: "lookup_key" | "env_price_id" | "product_name" | "none";
  matched: boolean;
};

export function resolvePlanFromStripeDetails(params: {
  mode: StripeMode;
  priceId: string | null;
  lookupKey: string | null;
  productName: string | null;
}): PricePlanResolution {
  const { mode, priceId, lookupKey, productName } = params;

  // A) lookup_key first
  const proKey = process.env.STRIPE_LOOKUP_KEY_PRO_MONTHLY ?? "verial_pro_monthly";
  const eliteKey = process.env.STRIPE_LOOKUP_KEY_ELITE_MONTHLY ?? "verial_elite_monthly";
  if (lookupKey && lookupKey === eliteKey) return { plan: "elite", source: "lookup_key", matched: true };
  if (lookupKey && lookupKey === proKey) return { plan: "pro", source: "lookup_key", matched: true };

  // B) env price id match (mode-aware if configured)
  const expected = getExpectedStripePriceIds({ mode });
  if (priceId && expected.pro && priceId === expected.pro) return { plan: "pro", source: "env_price_id", matched: true };
  if (priceId && expected.elite && priceId === expected.elite) return { plan: "elite", source: "env_price_id", matched: true };

  // C) product name fallback (last resort)
  const normalizedName = (productName ?? "").toLowerCase();
  if (normalizedName.includes("elite") && normalizedName.includes("monthly")) {
    return { plan: "elite", source: "product_name", matched: true };
  }
  if (normalizedName.includes("pro") && normalizedName.includes("monthly")) {
    return { plan: "pro", source: "product_name", matched: true };
  }

  // D) unknown (do NOT silently treat as starter)
  return { plan: "unknown", source: "none", matched: false };
}
