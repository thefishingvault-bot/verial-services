"use server";

import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

function formatCurrency(amountInCents: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  }).format(amountInCents / 100);
}

export async function ProviderServicePerformanceCard() {
  const { userId } = await auth();
  if (!userId) return null;

  const provider = await db.query.providers.findFirst({
    where: (p, { eq }) => eq(p.userId, userId),
    columns: { id: true },
  });

  if (!provider) return null;

  const now = new Date();
  const monthsBack = 3;
  const start = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);

  const rows = await db.query.bookings.findMany({
    where: (b, { and, eq, gte }) =>
      and(eq(b.providerId, provider.id), eq(b.status, "completed"), gte(b.createdAt, start)),
    columns: { id: true, serviceId: true, priceAtBooking: true },
    with: {
      service: {
        columns: { title: true },
      },
    },
  });

  if (rows.length === 0) {
    return (
      <Card className="hover:shadow-lg transition-shadow h-full">
        <CardHeader>
          <CardTitle>Service performance</CardTitle>
          <CardDescription>
            Once you complete jobs, your top services will appear here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No completed jobs yet in the last few months.
          </p>
        </CardContent>
      </Card>
    );
  }

  type Bucket = {
    serviceId: string;
    title: string;
    jobs: number;
    revenueCents: number;
  };

  const map = new Map<string, Bucket>();

  for (const row of rows) {
    if (!row.serviceId) continue;
    const key = row.serviceId;
    const existing = map.get(key) ?? {
      serviceId: key,
      title: row.service?.title ?? "Untitled service",
      jobs: 0,
      revenueCents: 0,
    };

    existing.jobs += 1;
    existing.revenueCents += row.priceAtBooking;

    map.set(key, existing);
  }

  const services = Array.from(map.values()).sort(
    (a, b) => b.revenueCents - a.revenueCents,
  );

  const topServices = services.slice(0, 5);

  return (
    <Card className="hover:shadow-lg transition-shadow h-full">
      <CardHeader>
        <CardTitle>Service performance</CardTitle>
        <CardDescription>Top services by jobs and revenue (last 3 months).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {topServices.map((svc) => {
          const avgTicketCents = svc.jobs ? Math.round(svc.revenueCents / svc.jobs) : 0;
          return (
            <div
              key={svc.serviceId}
              className="flex flex-col rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium line-clamp-2">{svc.title}</span>
                <span className="font-semibold">{formatCurrency(svc.revenueCents)}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>
                  {svc.jobs} job{svc.jobs === 1 ? "" : "s"}
                </span>
                <span className="text-xs">
                  Avg ticket: {avgTicketCents ? formatCurrency(avgTicketCents) : "–"}
                </span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
