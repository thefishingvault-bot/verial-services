import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { requireProvider } from "@/lib/auth-guards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";

type ProviderOverviewMetrics = {
  newRequestsCount: number;
  confirmedThisMonthCount: number;
  pendingPayoutsNet: number;
  completedPayoutsNet: number;
};

async function loadOverview(): Promise<ProviderOverviewMetrics> {
  const cookieHeader = headers().get("cookie") ?? "";

  const fetchWithAuth = (path: string) =>
    fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}${path}`, {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    }).catch(() => null);

  const [bookingsRes, earningsRes] = await Promise.all([
    fetchWithAuth("/api/provider/bookings/list"),
    fetchWithAuth("/api/provider/earnings/summary"),
  ]);

  let newRequestsCount = 0;
  let confirmedThisMonthCount = 0;
  let pendingPayoutsNet = 0;
  let completedPayoutsNet = 0;

  if (bookingsRes?.ok) {
    try {
      const all = (await bookingsRes.json()) as Array<{
        status: string;
        createdAt: string;
      }>;
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      newRequestsCount = all.filter((b) => b.status === "pending").length;
      confirmedThisMonthCount = all.filter((b) => {
        const created = new Date(b.createdAt);
        return (
          ["accepted", "paid", "completed"].includes(b.status) && created >= monthStart
        );
      }).length;
    } catch (err) {
      console.error("Failed to parse provider bookings list", err);
    }
  }

  if (earningsRes?.ok) {
    try {
      const summary = (await earningsRes.json()) as {
        pendingPayoutsNet?: number;
        completedPayoutsNet?: number;
      };
      pendingPayoutsNet = summary.pendingPayoutsNet ?? 0;
      completedPayoutsNet = summary.completedPayoutsNet ?? 0;
    } catch (err) {
      console.error("Failed to parse provider earnings summary", err);
    }
  }

  return { newRequestsCount, confirmedThisMonthCount, pendingPayoutsNet, completedPayoutsNet };
}

export default async function ProviderDashboardPage() {
  await requireProvider();
  // auth() called to ensure correct user context for API routes when using absolute URLs
  await auth();

  const metrics = await loadOverview();

  const cards: Array<{ label: string; value: string; hint: string }> = [
    {
      label: "New requests",
      value: String(metrics.newRequestsCount),
      hint: metrics.newRequestsCount === 0 ? "No pending requests" : "Awaiting your response",
    },
    {
      label: "Jobs confirmed",
      value: String(metrics.confirmedThisMonthCount),
      hint: "Confirmed this month",
    },
    {
      label: "Payouts pending",
      value: formatPrice(metrics.pendingPayoutsNet),
      hint: "Awaiting transfer",
    },
    {
      label: "Payouts completed",
      value: formatPrice(metrics.completedPayoutsNet),
      hint: "Total paid out",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Stay on top of new requests, update your schedule, and track payouts.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((item) => (
          <Card key={item.label}>
            <CardHeader className="space-y-1 pb-2">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <CardTitle className="text-2xl">{item.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{item.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Upcoming requests</CardTitle>
            <Button asChild size="sm" variant="ghost">
              <Link href="/dashboard/provider/bookings">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
              {metrics.newRequestsCount === 0
                ? "No new booking requests yet. Keep your availability up to date to get matched faster."
                : `You have ${metrics.newRequestsCount} new booking request${
                    metrics.newRequestsCount === 1 ? "" : "s"
                  } awaiting your response.`}
            </div>
            <div className="flex items-center justify-between rounded-md bg-background px-3 py-2">
              <div>
                <p className="text-sm font-medium">Today</p>
                <p className="text-xs text-muted-foreground">
                  Keep your calendar up to date so customers can book you when you're available.
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/provider/calendar">Edit availability</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Earnings snapshot</CardTitle>
            <Button asChild size="sm" variant="ghost">
              <Link href="/dashboard/provider/earnings">Payouts</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
              <div>
                <p className="text-sm font-semibold">{formatPrice(metrics.completedPayoutsNet)}</p>
                <p className="text-xs text-muted-foreground">Total paid out</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border bg-background px-3 py-2">
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-lg font-semibold">{formatPrice(metrics.pendingPayoutsNet)}</p>
              </div>
              <div className="rounded-md border bg-background px-3 py-2">
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="text-lg font-semibold">{formatPrice(metrics.completedPayoutsNet)}</p>
              </div>
            </div>
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Payouts are sent to your connected account when bookings are completed and funds clear.
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Performance insights</CardTitle>
            <Button asChild size="sm" variant="ghost">
              <Link href="/dashboard/provider/notifications">Alerts</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-foreground">
              <span>Response time</span>
              <span className="font-medium">Keep responses fast for better ranking</span>
            </div>
            <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-foreground">
              <span>Cancellation rate</span>
              <span className="font-medium">Aim to minimise last-minute cancellations</span>
            </div>
            <p>
              Review new requests quickly and keep your hours and time off up to date to avoid
              clashes.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/dashboard/provider/services">Update services</Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/dashboard/provider/calendar">Adjust schedule</Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/dashboard/provider/profile">Edit provider profile</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

