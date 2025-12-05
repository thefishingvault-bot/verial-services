"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Building, ExternalLink, Loader2 } from "lucide-react";
import { formatPrice } from "@/lib/utils";

type ConnectDetails = {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  stripeConnectId: string | null;
};

type EarningsSummary = {
  currency: string;
  lifetime: { gross: number; fee: number; gst: number; net: number };
  last30: { gross: number; fee: number; gst: number; net: number };
  pendingPayoutsNet: number;
  completedPayoutsNet: number;
  upcomingPayout: {
    id: string;
    amount: number;
    status: string;
    arrivalDate: string | null;
    estimatedArrival: string | null;
  } | null;
  recentBookings: {
    bookingId: string;
    serviceTitle: string | null;
    bookingStatus: string;
    payoutStatus: string;
    grossAmount: number;
    platformFeeAmount: number;
    gstAmount: number;
    netAmount: number;
    payoutDate: string | null;
    paidAt: string | null;
  }[];
};

type StripeBalance = {
  available: number;
  pending: number;
  currency: string;
};

type StripePayout = {
  id: string;
  amount: number;
  status: string;
  arrivalDate: number;
  created: number;
  method: string | null;
  type: string | null;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

export default function PayoutsPage() {
  const [details, setDetails] = useState<ConnectDetails | null>(null);
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [balance, setBalance] = useState<StripeBalance | null>(null);
  const [payouts, setPayouts] = useState<StripePayout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const detailsData = await fetchJson<ConnectDetails>("/api/provider/connect/details");
        if (cancelled) return;
        setDetails(detailsData);

        if (detailsData.stripeConnectId && detailsData.payoutsEnabled) {
          const [summaryData, balanceData, payoutData] = await Promise.all([
            fetchJson<EarningsSummary>("/api/provider/earnings/summary"),
            fetchJson<StripeBalance>("/api/provider/stripe/balance"),
            fetchJson<{ payouts: StripePayout[]; currency: string }>("/api/provider/stripe/payouts"),
          ]);
          if (cancelled) return;
          setSummary(summaryData);
          setBalance(balanceData);
          setPayouts(payoutData.payouts || []);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Failed to load financial data.";
          setError(message || "Failed to load financial data.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOnboarding = async () => {
    setIsRedirecting(true);
    try {
      const res = await fetch("/api/provider/connect/create-link", { method: "POST" });
      if (!res.ok) throw new Error("Failed to create onboarding link.");
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create onboarding link.";
      setError(message);
      setIsRedirecting(false);
    }
  };

  const currency = useMemo(() => summary?.currency || balance?.currency || "NZD", [summary, balance]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="ml-2 text-muted-foreground">Loading financial data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-destructive flex items-center">
        <AlertTriangle className="mr-2 h-5 w-5" /> {error}
      </div>
    );
  }

  // Not onboarded or payouts disabled
  if (!details?.payoutsEnabled) {
    return (
      <div className="max-w-xl mx-auto p-4 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Get Paid with Verial</CardTitle>
            <CardDescription>
              {!details?.detailsSubmitted
                ? "Connect your bank account to receive payouts."
                : "Your account is under review. Please check back soon."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleOnboarding} disabled={isRedirecting} className="w-full">
              {isRedirecting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              {details?.detailsSubmitted ? "Check Status in Stripe" : "Start Stripe Onboarding"}
            </Button>
            <p className="text-xs text-muted-foreground">
              You must complete Stripe Connect verification before accepting bookings and payouts.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Payouts</h1>
          <p className="text-sm text-muted-foreground">
            Earnings, fees, GST, and payout schedule from your paid bookings.
          </p>
        </div>
        <Button variant="outline" onClick={handleOnboarding} disabled={isRedirecting}>
          {isRedirecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Building className="mr-2 h-4 w-4" />}
          Stripe settings
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Lifetime gross" value={summary?.lifetime?.gross ?? 0} currency={currency} />
        <MetricCard label="Lifetime net" value={summary?.lifetime?.net ?? 0} currency={currency} />
        <MetricCard label="Last 30d net" value={summary?.last30?.net ?? 0} currency={currency} />
        <MetricCard label="Pending payout" value={summary?.pendingPayoutsNet ?? 0} currency={currency} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Platform fee</CardTitle>
            <CardDescription>10% unless overridden by PLATFORM_FEE_BPS.</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatPrice(summary?.lifetime?.fee ?? 0, currency)}
            <div className="text-xs text-muted-foreground mt-1">Lifetime collected</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>GST component</CardTitle>
            <CardDescription>Based on service/provider GST setting.</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatPrice(summary?.lifetime?.gst ?? 0, currency)}
            <div className="text-xs text-muted-foreground mt-1">Lifetime GST</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Stripe balance</CardTitle>
            <CardDescription>Connect available vs pending.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Available</span>
              <span className="font-semibold">{formatPrice(balance?.available ?? 0, currency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Pending</span>
              <span className="font-semibold">{formatPrice(balance?.pending ?? 0, currency)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming payout</CardTitle>
          <CardDescription>Next Stripe payout window.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {summary?.upcomingPayout ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold">{formatPrice(summary.upcomingPayout.amount, currency)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="font-semibold capitalize">{summary.upcomingPayout.status}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Arrival</span>
                <span>
                  {summary.upcomingPayout.arrivalDate
                    ? new Date(summary.upcomingPayout.arrivalDate).toLocaleDateString("en-NZ")
                    : summary.upcomingPayout.estimatedArrival
                      ? new Date(summary.upcomingPayout.estimatedArrival).toLocaleDateString("en-NZ")
                      : "Pending"}
                </span>
              </div>
            </>
          ) : (
            <div className="text-muted-foreground">No payout scheduled yet.</div>
          )}
          <Separator className="my-2" />
          <p className="text-xs text-muted-foreground">
            Fees and GST are applied automatically per booking; payouts follow Stripe Connect schedules.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent paid bookings</CardTitle>
          <CardDescription>Gross, platform fee, GST, net, and payout status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Booking</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Gross</TableHead>
                  <TableHead>Fee</TableHead>
                  <TableHead>GST</TableHead>
                  <TableHead>Net</TableHead>
                  <TableHead>Payout</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary?.recentBookings?.length ? (
                  summary.recentBookings.map((row) => (
                    <TableRow key={row.bookingId}>
                      <TableCell className="font-medium">{row.bookingId}</TableCell>
                      <TableCell>{row.serviceTitle || "Service"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.bookingStatus}</TableCell>
                      <TableCell>{formatPrice(row.grossAmount, currency)}</TableCell>
                      <TableCell>{formatPrice(row.platformFeeAmount, currency)}</TableCell>
                      <TableCell>{formatPrice(row.gstAmount, currency)}</TableCell>
                      <TableCell className="font-semibold">{formatPrice(row.netAmount, currency)}</TableCell>
                      <TableCell className="text-xs">
                        <div className="capitalize">{row.payoutStatus}</div>
                        {row.payoutDate ? (
                          <div className="text-muted-foreground">
                            {new Date(row.payoutDate).toLocaleDateString("en-NZ", {
                              month: "short",
                              day: "numeric",
                            })}
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                      No paid bookings yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payout history</CardTitle>
          <CardDescription>Recent Stripe payouts to your bank.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                      No payouts yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  payouts.map((payout) => (
                    <TableRow key={payout.id}>
                      <TableCell>{new Date(payout.arrivalDate * 1000).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Badge variant={payout.status === "paid" ? "default" : "secondary"} className="capitalize">
                          {payout.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground capitalize">{payout.method || payout.type || "payout"}</TableCell>
                      <TableCell className="text-right font-medium">{formatPrice(payout.amount, currency)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value, currency }: { label: string; value: number; currency: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle>{formatPrice(value, currency)}</CardTitle>
      </CardHeader>
    </Card>
  );
}

