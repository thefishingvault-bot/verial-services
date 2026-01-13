"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ShieldCheck, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchJson, getErrorMessage } from "@/lib/api/fetch-json";

interface ConnectDetails {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  stripeConnectId: string | null;
}

export function ProviderConnectBanner() {
  const [details, setDetails] = useState<ConnectDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingLink, setCreatingLink] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/provider/connect/details", { cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as ConnectDetails;
        if (!cancelled) setDetails(data);
      } catch (err) {
        if (!cancelled) setError("Unable to load payout status. Try again." + (err instanceof Error ? ` (${err.message})` : ""));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStartOnboarding = async () => {
    setCreatingLink(true);
    setError(null);
    try {
      const { url } = await fetchJson<{ url: string }>("/api/provider/connect/create-link", { method: "POST" });
      window.location.href = url;
    } catch (err) {
      const message = getErrorMessage(err, "Unable to start onboarding");
      if (message) {
        setError(message);
        setCreatingLink(false);
      }
    }
  };

  if (loading) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking payout readiness
          </CardTitle>
          <CardDescription>Fetching your Stripe Connect status.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!details) {
    return null;
  }

  const ready = details.chargesEnabled && details.payoutsEnabled;

  if (ready) {
    return (
      <Card className="border border-green-200 bg-green-50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-green-600" /> Payouts ready
          </CardTitle>
          <CardDescription>Stripe Connect is fully enabled for this account.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3 text-xs">
          <Badge variant="outline">Charges on</Badge>
          <Badge variant="outline">Payouts on</Badge>
          <Link href="/dashboard/payouts" className="text-primary hover:underline font-medium">
            View payouts
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600" /> Finish Stripe Connect onboarding
        </CardTitle>
        <CardDescription className="text-xs">
          You need to complete Stripe onboarding to receive payouts. This also enables customers to be charged.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={details.detailsSubmitted ? "outline" : "secondary"}>
              Details {details.detailsSubmitted ? "submitted" : "pending"}
            </Badge>
            <Badge variant={details.chargesEnabled ? "outline" : "secondary"}>
              Charges {details.chargesEnabled ? "enabled" : "disabled"}
            </Badge>
            <Badge variant={details.payoutsEnabled ? "outline" : "secondary"}>
              Payouts {details.payoutsEnabled ? "enabled" : "disabled"}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Completing onboarding redirects to Stripe; we&rsquo;ll return you to payouts when done.
          </p>
          {error && <p className="text-destructive">{error}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/payouts">Open payouts</Link>
          </Button>
          <Button onClick={handleStartOnboarding} disabled={creatingLink}>
            {creatingLink ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Start onboarding
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
