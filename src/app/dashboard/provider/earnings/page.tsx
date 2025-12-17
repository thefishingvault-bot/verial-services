import { auth } from "@clerk/nextjs/server";
import { requireProvider } from "@/lib/auth-guards";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EarningsSummaryCards } from "@/components/provider/earnings-summary-cards";
import { EarningsBookingsTable } from "@/components/provider/earnings-bookings-table";
import { StripeWarning } from "@/components/provider/stripe-warning";
import { formatPrice } from "@/lib/utils";
import { cookies, headers } from "next/headers";

type EarningsSummaryResponse = {
  currency: string;
  connect?: {
    stripeConnectId: string | null;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
  };
  lifetime: {
    gross: number;
    fee: number;
    gst: number;
    net: number;
  };
  last30: {
    gross: number;
    fee: number;
    gst: number;
    net: number;
  };
  pendingPayoutsNet: number;
  completedPayoutsNet: number;
  upcomingPayout: {
    id: string;
    amount: number;
    status: "pending" | "in_transit" | string;
    arrivalDate: string | null;
    estimatedArrival: string | null;
  } | null;
  recentBookings: Array<{
    bookingId: string;
    serviceTitle: string | null;
    bookingStatus: string | null;
    payoutStatus: string | null;
    grossAmount: number;
    platformFeeAmount: number;
    gstAmount: number;
    netAmount: number;
    payoutDate: string | null;
    paidAt: string | null;
  }>;
};

async function loadEarnings(): Promise<EarningsSummaryResponse | null> {
  try {
    let host: string | null = null;
    let proto: string = "https";
    try {
      const hdrs = await headers();
      const forwardedHost = hdrs.get("x-forwarded-host");
      host = forwardedHost ?? hdrs.get("host");
      proto = hdrs.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
    } catch {
      host = null;
      proto = "http";
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : host ? `${proto}://${host}` : "http://localhost:3000");

    let cookieHeader = "";
    try {
      cookieHeader = (await cookies()).toString();
    } catch {
      cookieHeader = "";
    }
    const res = await fetch(`${baseUrl}/api/provider/earnings/summary`, {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
    if (!res.ok) return null;
    return (await res.json()) as EarningsSummaryResponse;
  } catch {
    return null;
  }
}

export default async function ProviderEarningsPage() {
  await requireProvider();
  await auth();

  const earnings = await loadEarnings();

  const currency = earnings?.currency ?? "NZD";

  const lifetimeNet = earnings?.lifetime?.net ?? 0;
  const last30Net = earnings?.last30?.net ?? 0;
  const pendingNet = earnings?.pendingPayoutsNet ?? 0;
  const completedNet = earnings?.completedPayoutsNet ?? 0;

  const upcoming = earnings?.upcomingPayout ?? null;

  const stripeConfigured = !!earnings?.connect?.stripeConnectId && !!earnings?.connect?.payoutsEnabled;

  return (
    <div className="space-y-6">
      {!stripeConfigured && <StripeWarning />}

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Earnings</h1>
        <p className="text-sm text-muted-foreground">
          Track what you&apos;ve earned, what&apos;s on the way, and recent payouts.
        </p>
      </div>

      <EarningsSummaryCards
        currency={currency}
        lifetimeNet={lifetimeNet}
        last30Net={last30Net}
        pendingNet={pendingNet}
        completedNet={completedNet}
      />

      <Card>
        <CardHeader>
          <CardTitle>Upcoming payout</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {upcoming ? (
            <>
              <p className="text-lg font-semibold">
                {formatPrice(upcoming.amount, currency)}
              </p>
              <p className="text-muted-foreground">
                {upcoming.arrivalDate
                  ? `Expected by ${new Date(upcoming.arrivalDate).toLocaleDateString()}`
                  : upcoming.estimatedArrival
                  ? `Estimated by ${new Date(upcoming.estimatedArrival).toLocaleDateString()}`
                  : "Scheduled payout"}
              </p>
              <p className="text-xs text-muted-foreground">
                Status: <span className="font-medium">{upcoming.status}</span>
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">
              No upcoming payouts yet. Once jobs are completed and funds clear, your next payout will
              appear here.
            </p>
          )}
        </CardContent>
      </Card>

      <EarningsBookingsTable
        currency={currency}
        recentBookings={earnings?.recentBookings ?? []}
      />
    </div>
  );
}

