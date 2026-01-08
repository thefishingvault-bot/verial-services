export type ProviderPlan = "starter" | "pro" | "elite" | "unknown";

export type StripeMode = "test" | "live";

const trim = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
};

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
  if (plan === "pro") return trim(process.env.STRIPE_PRICE_PRO_MONTHLY) ?? trim(process.env.STRIPE_PRICE_PRO) ?? null;
  if (plan === "elite") return trim(process.env.STRIPE_PRICE_ELITE_MONTHLY) ?? trim(process.env.STRIPE_PRICE_ELITE) ?? null;
  return null;
}

export function getStripeLookupKeyForPlan(plan: ProviderPlan): string | null {
  if (plan === "pro") return trim(process.env.STRIPE_LOOKUP_KEY_PRO_MONTHLY) ?? "verial_pro_monthly";
  if (plan === "elite") return trim(process.env.STRIPE_LOOKUP_KEY_ELITE_MONTHLY) ?? "verial_elite_monthly";
  return null;
}

export function getExpectedStripePriceIds(params: { mode: StripeMode }): {
  pro: string | null;
  elite: string | null;
  source: "mode_env" | "legacy_env" | "none";
} {
  const { mode } = params;

  // New, explicit mode-aware env vars (requested).
  const proMode = trim(mode === "test" ? process.env.STRIPE_PRO_PRICE_ID_TEST : process.env.STRIPE_PRO_PRICE_ID_LIVE);
  const eliteMode = trim(mode === "test" ? process.env.STRIPE_ELITE_PRICE_ID_TEST : process.env.STRIPE_ELITE_PRICE_ID_LIVE);

  if (proMode || eliteMode) return { pro: proMode, elite: eliteMode, source: "mode_env" };

  // Back-compat: existing env vars used across environments.
  const proLegacy = trim(process.env.STRIPE_PRICE_PRO_MONTHLY) ?? trim(process.env.STRIPE_PRICE_PRO);
  const eliteLegacy = trim(process.env.STRIPE_PRICE_ELITE_MONTHLY) ?? trim(process.env.STRIPE_PRICE_ELITE);
  if (proLegacy || eliteLegacy) return { pro: proLegacy, elite: eliteLegacy, source: "legacy_env" };

  return { pro: null, elite: null, source: "none" };
}

export function getStripeProductIdForPlan(plan: ProviderPlan): string | null {
  if (plan === "pro") return trim(process.env.STRIPE_PRODUCT_PRO);
  if (plan === "elite") return trim(process.env.STRIPE_PRODUCT_ELITE);
  if (plan === "starter") return trim(process.env.STRIPE_PRODUCT_STARTER);
  return null;
}

export function planFromStripePriceId(priceId: string | null | undefined): ProviderPlan | null {
  const trimmed = trim(priceId);
  if (!trimmed) return null;
  const pro = trim(process.env.STRIPE_PRICE_PRO_MONTHLY) ?? trim(process.env.STRIPE_PRICE_PRO);
  const elite = trim(process.env.STRIPE_PRICE_ELITE_MONTHLY) ?? trim(process.env.STRIPE_PRICE_ELITE);
  if (pro && trimmed === pro) return "pro";
  if (elite && trimmed === elite) return "elite";
  return null;
}

export function resolvePlanFromStripePrice(params: {
  priceId: string | null | undefined;
  priceLookupKey?: string | null | undefined;
}): ProviderPlan | null {
  const lookupKey = trim(params.priceLookupKey);
  // A) lookup_key first (requested)
  if (lookupKey) {
    const proKey = getStripeLookupKeyForPlan("pro") ?? "verial_pro_monthly";
    const eliteKey = getStripeLookupKeyForPlan("elite") ?? "verial_elite_monthly";
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
  source: "lookup_key" | "env_price_id" | "env_product_id" | "product_name" | "none";
  matched: boolean;
};

export function resolvePlanFromStripeDetails(params: {
  mode: StripeMode;
  priceId: string | null;
  lookupKey: string | null;
  productId: string | null;
  productName: string | null;
}): PricePlanResolution {
  const mode = params.mode;
  const priceId = trim(params.priceId);
  const lookupKey = trim(params.lookupKey);
  const productId = trim(params.productId);
  const productName = params.productName ?? null;

  // A) lookup_key first
  const proKey = getStripeLookupKeyForPlan("pro") ?? "verial_pro_monthly";
  const eliteKey = getStripeLookupKeyForPlan("elite") ?? "verial_elite_monthly";
  if (lookupKey && lookupKey === eliteKey) return { plan: "elite", source: "lookup_key", matched: true };
  if (lookupKey && lookupKey === proKey) return { plan: "pro", source: "lookup_key", matched: true };

  // B) env price id match (mode-aware if configured)
  const expected = getExpectedStripePriceIds({ mode });
  if (priceId && expected.pro && priceId === expected.pro) return { plan: "pro", source: "env_price_id", matched: true };
  if (priceId && expected.elite && priceId === expected.elite) return { plan: "elite", source: "env_price_id", matched: true };

  // C) productId via env product ids (very reliable)
  const proProd = getStripeProductIdForPlan("pro");
  const eliteProd = getStripeProductIdForPlan("elite");
  const starterProd = getStripeProductIdForPlan("starter");
  if (productId && eliteProd && productId === eliteProd) return { plan: "elite", source: "env_product_id", matched: true };
  if (productId && proProd && productId === proProd) return { plan: "pro", source: "env_product_id", matched: true };
  if (productId && starterProd && productId === starterProd) return { plan: "starter", source: "env_product_id", matched: true };

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
