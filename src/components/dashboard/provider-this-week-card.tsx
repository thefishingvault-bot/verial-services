"use server";

import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { asOne } from "@/lib/relations/normalize";

function formatDate(d: Date) {
  return d.toLocaleString("en-NZ", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export async function ProviderThisWeekCard() {
  const { userId } = await auth();

  if (!userId) return null;

  const provider = await db.query.providers.findFirst({
    where: (p, { eq }) => eq(p.userId, userId),
    columns: { id: true },
  });

  if (!provider) return null;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const upcomingRaw = await db.query.bookings.findMany({
    where: (b, { and, eq, gte, lt, ne }) =>
      and(
        eq(b.providerId, provider.id),
        ne(b.status, "canceled_customer"),
        ne(b.status, "canceled_provider"),
        gte(b.scheduledDate, startOfToday),
        lt(b.scheduledDate, endOfWeek),
      ),
    orderBy: (b, { asc }) => asc(b.scheduledDate),
    columns: { id: true, scheduledDate: true, status: true },
    with: {
      user: { columns: { firstName: true, lastName: true } },
      service: { columns: { title: true } },
    },
  });

  const upcoming = upcomingRaw.filter((b) => b.scheduledDate);

  const count = upcoming.length;
  const topThree = upcoming.slice(0, 3);

  return (
    <Card className="hover:shadow-lg transition-shadow h-full">
      <CardHeader>
        <CardTitle>This week&apos;s jobs</CardTitle>
        <CardDescription>
          Next 7 days of bookings in your calendar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Jobs in the next 7 days</span>
          <span className="font-medium">{count}</span>
        </div>

        {topThree.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            No upcoming jobs this week yet. New confirmed bookings will show here.
          </p>
        ) : (
          <div className="space-y-2">
            {topThree.map((b) => {
              const dateLabel = b.scheduledDate ? formatDate(b.scheduledDate) : "TBC";
              const user = asOne(b.user);
              const service = asOne(b.service);
              const customerName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Customer";

              return (
                <div
                  key={b.id}
                  className="flex flex-col rounded-md border bg-muted/40 px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{dateLabel}</span>
                    <span className="capitalize text-muted-foreground">{b.status}</span>
                  </div>
                  <span className="mt-0.5 font-semibold line-clamp-1">{service?.title}</span>
                  <span className="text-muted-foreground line-clamp-1">{customerName}</span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
