"use server";

import { headers } from "next/headers";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

function formatCurrency(amountInCents: number, currency: string) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: currency.toUpperCase() || "NZD",
    maximumFractionDigits: 0,
  }).format(amountInCents / 100);
}

export async function ProviderPayoutsSummaryCard() {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  const protocol = h.get("x-forwarded-proto") || "https";
  const baseUrl = host ? `${protocol}://${host}` : "";

  const emptyState = (
    <Card className="hover:shadow-lg transition-shadow h-full">
      <CardHeader>
        <CardTitle>Payouts summary</CardTitle>
        <CardDescription>
          Connect Stripe to see available and pending payouts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Payout summary is not available right now.
        </p>
      </CardContent>
    </Card>
  );

  let data:
    | {
        available: number;
        pending: number;
        currency: string;
        payouts: { id: string; amount: number; status: string; arrivalDate: number }[];
      }
    | null = null;

  try {
    const res = await fetch(`${baseUrl}/api/provider/payouts/summary`, {
      cache: "no-store",
    });

    if (!res.ok) {
      return emptyState;
    }

    data = await res.json();
  } catch {
    return emptyState;
  }

  if (!data) {
    return emptyState;
  }

  const { available, pending, currency, payouts } = data;

  const nextPayout = payouts.find((p) => p.status === "pending" || p.status === "in_transit");

  return (
    <Card className="hover:shadow-lg transition-shadow h-full">
      <CardHeader>
        <CardTitle>Payouts summary</CardTitle>
        <CardDescription>Available vs pending balance from Stripe Connect.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Available to pay out</span>
          <span className="font-medium">{formatCurrency(available, currency)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Pending (on the way)</span>
          <span className="font-medium">{formatCurrency(pending, currency)}</span>
        </div>

        <div className="mt-2 rounded-md border bg-muted/40 p-3 text-xs">
          {nextPayout ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Next payout</span>
                <span className="font-semibold">{formatCurrency(nextPayout.amount, currency)}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">
                Est. arrival: {new Date(nextPayout.arrivalDate * 1000).toLocaleDateString("en-NZ", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          ) : (
            <p className="text-muted-foreground">
              No upcoming payouts yet. Once Stripe schedules a payout, it will show here.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
