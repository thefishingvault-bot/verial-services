"use client";

import { useEffect, useState } from "react";

import { StripeWarning } from "@/components/provider/stripe-warning";

type ConnectStatusResponse = {
  providerId: string;
  stripeConnectId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted?: boolean;
  currentlyDueCount?: number | null;
};

export function StripeConnectStatusBanner() {
  const [data, setData] = useState<ConnectStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);

      try {
        const res = await fetch("/api/provider/stripe/connect/status", {
          method: "GET",
          cache: "no-store",
        });

        if (!res.ok) {
          // If we can't load status, avoid blocking the page; keep banner visible.
          setData(null);
          return;
        }

        const json = (await res.json()) as ConnectStatusResponse;
        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return null;

  const stripeConnectId = data?.stripeConnectId ?? null;
  const payoutsEnabled = data?.payoutsEnabled ?? false;

  // Banner logic:
  // - If stripe_connect_id is null => show “not set up”
  // - Else if payouts_enabled false => show “verification incomplete”
  // - Else hide banner
  if (stripeConnectId && payoutsEnabled) {
    return null;
  }

  return <StripeWarning stripeConnectId={stripeConnectId} payoutsEnabled={payoutsEnabled} />;
}
