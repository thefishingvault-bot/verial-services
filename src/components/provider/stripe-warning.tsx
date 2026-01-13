"use client";

import { useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getErrorMessage } from "@/lib/api/fetch-json";

export function StripeWarning(props?: {
  stripeConnectId?: string | null;
  payoutsEnabled?: boolean;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasConnectId = !!props?.stripeConnectId;
  const payoutsEnabled = !!props?.payoutsEnabled;

  const copy = useMemo(() => {
    if (!hasConnectId) {
      return {
        title: "Stripe Connect not set up",
        description:
          "Your Stripe Connect payout account is not set up. You cannot receive payouts until verification is complete.",
        cta: "Complete Stripe setup",
      };
    }

    if (!payoutsEnabled) {
      return {
        title: "Stripe verification incomplete",
        description:
          "Your Stripe Connect account exists, but payouts aren’t enabled yet. Continue Stripe setup to finish verification.",
        cta: "Continue Stripe setup",
      };
    }

    return {
      title: "Stripe Connect ready",
      description: "Stripe payouts are enabled.",
      cta: "Open Stripe",
    };
  }, [hasConnectId, payoutsEnabled]);

  const handleStartOnboarding = async () => {
    setLoading(true);
    setError(null);

    try {
      const { url } = await fetchJson<{ url: string }>("/api/provider/stripe/connect/onboard", {
        method: "POST",
      });
      if (!url) throw new Error("Missing Stripe onboarding URL");

      window.location.href = url;
    } catch (err) {
      const message = getErrorMessage(err, "Unable to start Stripe onboarding");
      if (message) {
        setError(message);
        toast({
          variant: "destructive",
          title: "Stripe onboarding failed",
          description: message,
        });
        setLoading(false);
      }
    }
  };

  return (
    <Alert variant="destructive" className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex-1 space-y-1">
        <AlertTitle>{copy.title}</AlertTitle>
        <AlertDescription>
          {copy.description}
        </AlertDescription>
        {error ? <div className="text-sm text-destructive">{error}</div> : null}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="w-full sm:w-auto"
        onClick={handleStartOnboarding}
        disabled={loading}
      >
        {loading ? "Starting…" : copy.cta}
      </Button>
    </Alert>
  );
}
