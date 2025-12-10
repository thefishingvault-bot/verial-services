import Link from "next/link";
import { requireProvider } from "@/lib/auth-guards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProviderBookingsClient } from "./bookings-client";

export default async function ProviderBookingsPage() {
  await requireProvider();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bookings</h1>
          <p className="text-sm text-muted-foreground">
            Manage new requests, upcoming jobs, and booking history.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/provider/calendar">View calendar</Link>
        </Button>
      </div>

      <ProviderBookingsClient />
    </div>
  );
}

