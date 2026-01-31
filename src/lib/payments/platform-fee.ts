import { normalizeProviderPlan, type ProviderPlan } from "@/lib/provider-subscription";

export function getProviderPlatformFeeBps(plan: ProviderPlan): number {
  // Fixed tier schedule (requested): Starter 10%, Pro 5%, Elite 0%.
  if (plan === "pro") return 500;
  if (plan === "elite") return 0;
  return 1000;
}

export function calculatePlatformFeeCents(params: {
  servicePriceCents: number;
  platformFeeBps: number;
}): number {
  const { servicePriceCents, platformFeeBps } = params;
  if (!Number.isFinite(servicePriceCents) || servicePriceCents < 0) return 0;
  if (!Number.isFinite(platformFeeBps) || platformFeeBps <= 0) return 0;
  return Math.round((servicePriceCents * platformFeeBps) / 10000);
}

export function calculateDestinationChargeAmounts(params: {
  servicePriceCents: number;
  serviceFeeCents: number;
  providerPlan: unknown;
}): {
  providerTier: ProviderPlan;
  platformFeeBps: number;
  platformFeeCents: number;
  totalCents: number;
  applicationFeeCents: number;
  providerPayoutCents: number;
} {
  const { servicePriceCents, serviceFeeCents, providerPlan } = params;

  const providerTier = normalizeProviderPlan(providerPlan);
  const platformFeeBps = getProviderPlatformFeeBps(providerTier);
  const platformFeeCents = calculatePlatformFeeCents({ servicePriceCents, platformFeeBps });

  const safeServiceFeeCents = Math.max(0, Math.trunc(serviceFeeCents));
  const totalCents = Math.max(0, Math.trunc(servicePriceCents) + safeServiceFeeCents);
  const applicationFeeCents = Math.max(0, safeServiceFeeCents + platformFeeCents);
  const providerPayoutCents = Math.max(0, Math.trunc(servicePriceCents) - platformFeeCents);

  return {
    providerTier,
    platformFeeBps,
    platformFeeCents,
    totalCents,
    applicationFeeCents,
    providerPayoutCents,
  };
}
