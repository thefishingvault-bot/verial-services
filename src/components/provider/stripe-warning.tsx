"use client";

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

export function StripeWarning() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartOnboarding = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/provider/stripe/connect/onboard", {
        method: "POST",
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Request failed (${res.status})`);
      }

      const { url } = (await res.json()) as { url: string };
      if (!url) throw new Error("Missing Stripe onboarding URL");

      window.location.href = url;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to start Stripe onboarding";
      setError(message);
      toast({
        variant: "destructive",
        title: "Stripe onboarding failed",
        description: message,
      });
      setLoading(false);
    }
  };

  return (
    <Alert variant="destructive" className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex-1 space-y-1">
        <AlertTitle>Stripe Connect not set up</AlertTitle>
        <AlertDescription>
          Your Stripe Connect payout account is not set up. You cannot receive payouts until
          verification is complete.
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
        {loading ? "Starting…" : "Complete Stripe setup"}
      </Button>
    </Alert>
  );
}
