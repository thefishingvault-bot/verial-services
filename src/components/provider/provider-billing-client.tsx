"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type ProviderPlan = "starter" | "pro" | "elite" | "unknown";

type SubscriptionStatusResponse = {
  providerId: string;
  plan: ProviderPlan;
  stripe: {
    customerId: string | null;
    subscriptionId: string | null;
    status: string | null;
    priceId: string | null;
    subscription_price_id?: string | null;
    subscription_lookup_key?: string | null;
    subscription_product_id?: string | null;
    subscription_product_name?: string | null;
    subscription_item_price_ids?: string[];
    subscription_item_lookup_keys?: Array<string | null>;
    priceResolutionSource?: string | null;
    expectedProPriceIdMasked?: string | null;
    expectedElitePriceIdMasked?: string | null;
    expectedEnvSource?: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    lastSyncAt?: string | null;
  };
};

function isSubscribedStatus(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

function isNotSubscribedStatus(status: string | null | undefined): boolean {
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

function getJsonStringField(json: unknown, key: string): string | null {
  if (!json || typeof json !== "object") return null;
  const rec = json as Record<string, unknown>;
  const value = rec[key];
  return typeof value === "string" ? value : null;
}

const PLAN_LABEL: Record<ProviderPlan, string> = {
  starter: "Starter",
  pro: "Pro — Monthly",
  elite: "Elite — Monthly",
  unknown: "Unknown plan",
};

const PLAN_PRICE: Record<ProviderPlan, string> = {
  starter: "$0 NZD / month",
  pro: "$49 NZD / month",
  elite: "$99 NZD / month",
  unknown: "—",
};

const PLAN_COPY: Record<ProviderPlan, {
  headline: string;
  description: string;
  includes: string[];
  feeLine: string;
}> = {
  starter: {
    headline: "Best for getting started",
    description:
      "Create your provider profile, list services, and start receiving bookings with no monthly cost.",
    includes: [
      "Basic provider profile & service listings",
      "Standard search visibility",
      "Standard support",
    ],
    feeLine: "10% platform fee per completed booking",
  },
  pro: {
    headline: "Best for growing providers",
    description:
      "Reduce your fees and increase visibility as you grow your business. Ideal for active providers who want better margins and more exposure.",
    includes: [
      "Everything in Starter",
      "Improved search ranking",
      "Basic performance analytics",
      "Messaging tools",
    ],
    feeLine: "Reduced 5% platform fee per completed booking",
  },
  elite: {
    headline: "Best for top providers",
    description:
      "Maximize earnings with zero platform fees and premium visibility. Built for high-performing providers who want priority placement and full access.",
    includes: [
      "Everything in Pro",
      "Priority search placement & featured exposure",
      "Advanced analytics",
      "Priority support",
    ],
    feeLine: "0% platform fee per completed booking",
  },
  unknown: {
    headline: "Active subscription detected",
    description:
      "We found an active Stripe subscription but couldn't map it to Pro or Elite. Please contact support/admin and share the debug values below.",
    includes: [
      "Pro/Elite benefits may not apply until mapping is fixed",
      "Use Refresh to re-sync from Stripe",
    ],
    feeLine: "Standard platform fee may apply until resolved",
  },
};

export default function ProviderBillingClient() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SubscriptionStatusResponse | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<"pro" | "elite" | null>(null);
  const [billingUnavailable, setBillingUnavailable] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const currentPlan = data?.plan ?? "starter";

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/provider/subscription/status", { cache: "no-store" });
      if (!res.ok) {
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const json: unknown = await res.json().catch(() => null);
          const message =
            getJsonStringField(json, "error") ??
            getJsonStringField(json, "message") ??
            "Failed to load billing status";
          throw new Error(message);
        }
        throw new Error(await res.text());
      }
      const json = (await res.json()) as SubscriptionStatusResponse;
      setData(json);
    } catch (err) {
      console.error("[PROVIDER_BILLING_STATUS]", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to load billing status",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const refreshFromStripe = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch("/api/provider/subscription/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const contentType = res.headers.get("content-type") || "";
      const json: unknown = contentType.includes("application/json") ? await res.json().catch(() => null) : null;

      if (!res.ok) {
        const message = getJsonStringField(json, "error") ?? "Failed to refresh from Stripe";
        throw new Error(message);
      }

      setData(json as SubscriptionStatusResponse);
      toast({ title: "Synced", description: "Billing status refreshed from Stripe." });
    } catch (err) {
      console.error("[PROVIDER_BILLING_REFRESH]", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to refresh",
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    // After returning from Stripe Checkout, do an immediate server-side resync.
    // This avoids waiting for webhook timing to update the DB.
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "1") {
      refreshFromStripe();
    }
  }, [refreshFromStripe]);

  const currentStatusLabel = useMemo(() => {
    const status = data?.stripe.status;
    if (!status) return null;
    return status.replace(/_/g, " ");
  }, [data?.stripe.status]);

  const showBillingWarning = useMemo(() => {
    const status = data?.stripe.status;
    if (!status) return false;
    return isNotSubscribedStatus(status) && !isSubscribedStatus(status);
  }, [data?.stripe.status]);

  const showUnknownPlanWarning = useMemo(() => {
    const status = data?.stripe.status;
    if (!status) return false;
    return isSubscribedStatus(status) && currentPlan === "unknown";
  }, [data?.stripe.status, currentPlan]);

  const startCheckout = async (plan: "pro" | "elite") => {
    try {
      setCheckoutPlan(plan);
      setBillingUnavailable(null);
      const res = await fetch("/api/provider/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const err = getJsonStringField(json, "error") ?? "Failed to start checkout";
        if (
          res.status === 409 &&
          (err === "Stripe price inactive" ||
            err === "Stripe price mode mismatch" ||
            err === "Invalid Stripe price id" ||
            err.startsWith("Billing unavailable"))
        ) {
          setBillingUnavailable(
            "Billing is temporarily unavailable (plan price inactive). Please contact support/admin.",
          );
          return;
        }

        throw new Error(err);
      }

      const url = getJsonStringField(json, "url");
      if (!url) throw new Error("Checkout URL missing");
      window.location.href = url;
    } catch (err) {
      console.error("[PROVIDER_BILLING_CHECKOUT]", err);
      toast({ title: "Error", description: err instanceof Error ? err.message : "Checkout failed", variant: "destructive" });
    } finally {
      setCheckoutPlan(null);
    }
  };

  const openPortal = async () => {
    try {
      const res = await fetch("/api/provider/subscription/portal", { method: "POST" });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(getJsonStringField(json, "error") ?? "Failed to open billing portal");
      }
      const url = getJsonStringField(json, "url");
      if (!url) throw new Error("Portal URL missing");
      window.location.href = url;
    } catch (err) {
      console.error("[PROVIDER_BILLING_PORTAL]", err);
      toast({ title: "Error", description: err instanceof Error ? err.message : "Portal failed", variant: "destructive" });
    }
  };

  if (loading) return <div className="py-8 text-center">Loading billing...</div>;

  return (
    <div className="space-y-6">
      {billingUnavailable ? (
        <Alert variant="destructive">
          <AlertTitle>Billing unavailable</AlertTitle>
          <AlertDescription>{billingUnavailable}</AlertDescription>
        </Alert>
      ) : null}

      {showBillingWarning ? (
        <Alert variant="destructive">
          <AlertTitle>Subscription needs attention</AlertTitle>
          <AlertDescription>
            Stripe reports your subscription status as {currentStatusLabel ?? "unknown"}. You may lose Pro/Elite benefits until this is resolved.
          </AlertDescription>
        </Alert>
      ) : null}

      {showUnknownPlanWarning ? (
        <Alert variant="destructive">
          <AlertTitle>Active subscription found, but plan mapping is unknown</AlertTitle>
          <AlertDescription>
            Active Stripe subscription detected but price mapping is unknown: {data?.stripe.subscription_price_id ?? data?.stripe.priceId ?? "(missing price id)"}.
            Please share the debug panel values with support/admin.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Current Plan
            <Badge variant={currentPlan === "starter" ? "secondary" : "default"}>{PLAN_LABEL[currentPlan]}</Badge>
          </CardTitle>
          <CardDescription>
            {PLAN_PRICE[currentPlan]}
            {currentStatusLabel ? ` • Status: ${currentStatusLabel}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            Subscription changes are managed securely through Stripe.
            <div className="mt-2 text-xs">
              <div>stripe_customer_id: {data?.stripe.customerId ?? "—"}</div>
              <div>stripe_subscription_id: {data?.stripe.subscriptionId ?? "—"}</div>
              <div>subscription_status: {data?.stripe.status ?? "—"}</div>
              <div>subscription_plan: {currentPlan}</div>
              <div>last_sync_at: {data?.stripe.lastSyncAt ?? "—"}</div>
              <div>subscription_price_id: {data?.stripe.subscription_price_id ?? data?.stripe.priceId ?? "—"}</div>
              <div>subscription_lookup_key: {data?.stripe.subscription_lookup_key ?? "—"}</div>
              <div>subscription_product_id: {data?.stripe.subscription_product_id ?? "—"}</div>
              <div>subscription_product_name: {data?.stripe.subscription_product_name ?? "—"}</div>
              <div>subscription_item_price_ids: {(data?.stripe.subscription_item_price_ids ?? []).join(", ") || "—"}</div>
              <div>subscription_item_lookup_keys: {(data?.stripe.subscription_item_lookup_keys ?? []).join(", ") || "—"}</div>
              <div>priceResolutionSource: {data?.stripe.priceResolutionSource ?? "—"}</div>
              <div>expectedEnvSource: {data?.stripe.expectedEnvSource ?? "—"}</div>
              <div>expectedProPriceId: {data?.stripe.expectedProPriceIdMasked ?? "—"}</div>
              <div>expectedElitePriceId: {data?.stripe.expectedElitePriceIdMasked ?? "—"}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={refreshFromStripe} disabled={refreshing || checkoutPlan !== null}>
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>
            <Button onClick={openPortal} disabled={!data?.stripe.customerId}>Manage billing</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {(["starter", "pro", "elite"] as ProviderPlan[]).map((plan) => {
          const isCurrent = plan === currentPlan;
          const canUpgrade = plan !== "starter" && !isCurrent;
          const copy = PLAN_COPY[plan];

          return (
            <Card key={plan} className={isCurrent ? "border-primary/40" : undefined}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {PLAN_LABEL[plan]}
                  {isCurrent ? <Badge variant="outline">Current</Badge> : null}
                </CardTitle>
                <CardDescription>{PLAN_PRICE[plan]}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{copy.headline}</p>
                    <p className="text-sm text-muted-foreground">{copy.description}</p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Includes</p>
                    <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                      {copy.includes.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-1">
                    <Badge
                      variant="secondary"
                      className="w-full justify-center whitespace-normal text-center leading-snug wrap-break-word"
                    >
                      {copy.feeLine}
                    </Badge>
                  </div>
                </div>

                {plan === "starter" ? (
                  <Button variant="outline" disabled className="w-full">Included</Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => startCheckout(plan as "pro" | "elite")}
                    disabled={!canUpgrade || checkoutPlan !== null}
                  >
                    {isCurrent ? "Current" : `Upgrade to ${PLAN_LABEL[plan].split(" —")[0]}`}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
