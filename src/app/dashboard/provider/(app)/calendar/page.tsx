import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { loadProviderCalendar } from "@/lib/provider-calendar";
import { ProviderAvailabilityForm } from "@/components/provider/provider-availability-form";
import { ProviderCalendarClient } from "./calendar-client";

export const dynamic = "force-dynamic";

export default async function ProviderCalendarPage() {
  const { userId } = await auth();
  if (!userId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Unauthorized</CardTitle>
            <CardDescription>Please sign in as a provider.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const provider = await db.query.providers.findFirst({ where: eq(providers.userId, userId) });
  if (!provider) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Provider account required</CardTitle>
            <CardDescription>Register as a provider to access the calendar.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const data = await loadProviderCalendar({ providerId: provider.id });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Availability Calendar</h1>
          <p className="text-muted-foreground">Track bookings and block time off.</p>
        </div>
      </div>
      <ProviderAvailabilityForm />
      <ProviderCalendarClient initialEvents={data.bookings} initialTimeOffs={data.timeOffs} />
    </div>
  );
}
