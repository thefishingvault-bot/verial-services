"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";

type ProviderPlan = "starter" | "pro" | "elite";

type SubscriptionStatusResponse = {
  providerId: string;
  plan: ProviderPlan;
  stripe: {
    customerId: string | null;
    subscriptionId: string | null;
    status: string | null;
    priceId: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  };
};

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
};

const PLAN_PRICE: Record<ProviderPlan, string> = {
  starter: "$0 NZD / month",
  pro: "$29 NZD / month",
  elite: "$99 NZD / month",
};

export default function ProviderBillingClient() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SubscriptionStatusResponse | null>(null);

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

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const currentStatusLabel = useMemo(() => {
    const status = data?.stripe.status;
    if (!status) return null;
    return status.replace(/_/g, " ");
  }, [data?.stripe.status]);

  const startCheckout = async (plan: "pro" | "elite") => {
    try {
      const res = await fetch("/api/provider/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(getJsonStringField(json, "error") ?? "Failed to start checkout");
      }

      const url = getJsonStringField(json, "url");
      if (!url) throw new Error("Checkout URL missing");
      window.location.href = url;
    } catch (err) {
      console.error("[PROVIDER_BILLING_CHECKOUT]", err);
      toast({ title: "Error", description: err instanceof Error ? err.message : "Checkout failed", variant: "destructive" });
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
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchStatus}>Refresh</Button>
            <Button onClick={openPortal} disabled={!data?.stripe.customerId}>Manage billing</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {(["starter", "pro", "elite"] as ProviderPlan[]).map((plan) => {
          const isCurrent = plan === currentPlan;
          const canUpgrade = plan !== "starter" && !isCurrent;

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
                <div className="text-sm text-muted-foreground">
                  {plan === "starter" && "Basic access. Standard per-booking platform fee applies."}
                  {plan === "pro" && "No per-booking platform fee. Great for active providers."}
                  {plan === "elite" && "No per-booking platform fee with priority visibility benefits."}
                </div>

                {plan === "starter" ? (
                  <Button variant="outline" disabled className="w-full">Included</Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => startCheckout(plan as "pro" | "elite")}
                    disabled={!canUpgrade}
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
