"use server";

import { db } from "@/lib/db";
import { bookings } from "@/db/schema";
import { and, eq, gte, inArray } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

function formatMonthLabel(date: Date) {
  return date.toLocaleString("en-NZ", { month: "short", year: "numeric" });
}

function formatCurrency(amountInCents: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  }).format(amountInCents / 100);
}

export async function ProviderAnalyticsCard() {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  const provider = await db.query.providers.findFirst({
    where: (p, { eq }) => eq(p.userId, userId),
    columns: { id: true },
  });

  if (!provider) {
    return null;
  }

  const now = new Date();
  const monthsBack = 6;
  const start = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const rows = await db
    .select({
      createdAt: bookings.createdAt,
      priceAtBooking: bookings.priceAtBooking,
      status: bookings.status,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.providerId, provider.id),
        inArray(bookings.status, [
          "pending",
          "accepted",
          "declined",
          "paid",
          "completed",
          "canceled_customer",
          "canceled_provider",
        ]),
        gte(bookings.createdAt, start),
      ),
    );

  type Bucket = { label: string; jobs: number; revenueCents: number; monthStart: Date };
  const bucketsMap = new Map<string, Bucket>();

  const funnelRows = rows.filter((row) => row.createdAt >= thirtyDaysAgo);

  rows.forEach((row) => {
    const d = new Date(row.createdAt);
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const key = monthStart.toISOString();

    const existing = bucketsMap.get(key) ?? {
      label: formatMonthLabel(monthStart),
      jobs: 0,
      revenueCents: 0,
      monthStart,
    };

    if (row.status === "completed") {
      existing.jobs += 1;
      existing.revenueCents += row.priceAtBooking;
    }

    bucketsMap.set(key, existing);
  });

  const buckets = Array.from(bucketsMap.values()).sort(
    (a, b) => a.monthStart.getTime() - b.monthStart.getTime(),
  );

  if (buckets.length === 0) {
    return (
      <Card className="hover:shadow-lg transition-shadow h-full">
        <CardHeader>
          <CardTitle>Performance (last 6 months)</CardTitle>
          <CardDescription>
            Once you have completed jobs, your monthly performance will appear here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No completed jobs yet. Complete bookings to see jobs and revenue per month.
          </p>
        </CardContent>
      </Card>
    );
  }

  let bestMonth = buckets[0];
  for (const b of buckets) {
    if (b.revenueCents > bestMonth.revenueCents) {
      bestMonth = b;
    }
  }

  const totalJobs = buckets.reduce((sum, b) => sum + b.jobs, 0);
  const totalRevenueCents = buckets.reduce((sum, b) => sum + b.revenueCents, 0);

  const totalCompletedLast3MonthsCents = rows
    .filter((r) => r.status === "completed")
    .reduce((sum, r) => sum + r.priceAtBooking, 0);

  const completedLast3MonthsCount = rows.filter((r) => r.status === "completed").length;
  const avgTicketCents = completedLast3MonthsCount
    ? Math.round(totalCompletedLast3MonthsCents / completedLast3MonthsCount)
    : 0;

  const requested = funnelRows.length;
  const acceptedCount = funnelRows.filter((r) => r.status === "accepted").length;
  const paid = funnelRows.filter((r) => r.status === "paid").length;
  const completedLast30 = funnelRows.filter((r) => r.status === "completed").length;

  return (
    <Card className="hover:shadow-lg transition-shadow h-full">
      <CardHeader>
        <CardTitle>Performance (last 6 months)</CardTitle>
        <CardDescription>
          Completed jobs and revenue, based on finished bookings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total jobs</span>
          <span className="font-medium">{totalJobs}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total revenue</span>
          <span className="font-medium">{formatCurrency(totalRevenueCents)}</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Avg ticket (last 3 months)</span>
          <span className="font-medium">
            {avgTicketCents ? formatCurrency(avgTicketCents) : "–"}
          </span>
        </div>

        <div className="mt-2 rounded-md border bg-muted/40 p-3 text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Requests (30d)</span>
            <span className="font-medium">{requested}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Accepted</span>
            <span className="font-medium">{acceptedCount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Paid</span>
            <span className="font-medium">{paid}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Completed</span>
            <span className="font-medium">{completedLast30}</span>
          </div>
        </div>

        <div className="mt-2 space-y-2">
          {buckets.map((b) => (
            <div
              key={b.label}
              className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-xs"
            >
              <div className="flex flex-col">
                <span className="font-medium">{b.label}</span>
                <span className="text-muted-foreground">
                  {b.jobs} job{b.jobs === 1 ? "" : "s"}
                </span>
              </div>
              <span className="font-semibold">{formatCurrency(b.revenueCents)}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">
          <p>
            Best month: <span className="font-semibold">{bestMonth.label}</span> with
            {" "}
            <span className="font-semibold">{formatCurrency(bestMonth.revenueCents)}</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
