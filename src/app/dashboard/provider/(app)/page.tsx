import Link from "next/link";
import { requireProvider } from "@/lib/auth-guards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { db } from "@/lib/db";
import { bookings, providers } from "@/db/schema";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getProviderMoneySummary } from "@/server/providers/earnings";

type ProviderOverviewMetrics = {
  newRequestsCount: number;
  confirmedThisMonthCount: number;
  totalEarnedNetCents: number;
  pendingTransferNetCents: number;
  paidOutNetCents: number;
};

async function loadOverview(userId: string): Promise<ProviderOverviewMetrics> {
  const provider = await db.query.providers.findFirst({
    where: eq(providers.userId, userId),
    columns: { id: true },
  });

  if (!provider) {
    return {
      newRequestsCount: 0,
      confirmedThisMonthCount: 0,
      totalEarnedNetCents: 0,
      pendingTransferNetCents: 0,
      paidOutNetCents: 0,
    };
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [pendingBookingsRow, confirmedMonthRow, money] = await Promise.all([
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(bookings)
      .where(and(eq(bookings.providerId, provider.id), eq(bookings.status, "pending")))
      .then((rows) => rows[0]),
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(bookings)
      .where(
        and(
          eq(bookings.providerId, provider.id),
          inArray(bookings.status, ["accepted", "paid", "completed"]),
          gte(bookings.createdAt, monthStart),
        ),
      )
      .then((rows) => rows[0]),
    getProviderMoneySummary(provider.id),
  ]);

  const totalEarnedNetCents = Number(money.lifetimeEarnedNet ?? 0);
  const paidOutNetCents = Number(money.paidOutNet ?? 0);
  const pendingTransferNetCents = Number(money.pendingNet ?? 0);

  return {
    newRequestsCount: Number(pendingBookingsRow?.count ?? 0),
    confirmedThisMonthCount: Number(confirmedMonthRow?.count ?? 0),
    totalEarnedNetCents,
    pendingTransferNetCents,
    paidOutNetCents,
  };
}

export default async function ProviderDashboardPage() {
  const { userId } = await requireProvider();

  const metrics = await loadOverview(userId);

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
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Stay on top of new requests, update your schedule, and track payouts.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
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
                  Keep your calendar up to date so customers can book you when you&apos;re available.
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
            <CardTitle className="text-base">Earnings &amp; payouts</CardTitle>
            <Button asChild size="sm" variant="ghost">
              <Link href="/dashboard/provider/earnings">Net totals</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
              <div>
                <p className="text-sm font-semibold">{formatPrice(metrics.totalEarnedNetCents)}</p>
                <p className="text-xs text-muted-foreground">Total earned (net)</p>
                <p className="text-xs text-muted-foreground">
                  Includes pending + paid out. Updates when a job is completed and paid.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border bg-background px-3 py-2">
                <p className="text-xs text-muted-foreground">Pending transfer</p>
                <p className="text-lg font-semibold">{formatPrice(metrics.pendingTransferNetCents)}</p>
                <p className="text-xs text-muted-foreground">Earned, not paid out yet.</p>
              </div>
              <div className="rounded-md border bg-background px-3 py-2">
                <p className="text-xs text-muted-foreground">Paid out</p>
                <p className="text-lg font-semibold">{formatPrice(metrics.paidOutNetCents)}</p>
                <p className="text-xs text-muted-foreground">Transferred to your bank.</p>
              </div>
            </div>
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <p>Total earned = Pending transfer + Paid out.</p>
              <p>
                Upcoming jobs don&apos;t count until payment is received and the job is marked completed.
              </p>
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
