import { requireProvider } from "@/lib/auth-guards";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function ProviderBookingsPage() {
  await requireProvider();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bookings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Manage your bookings and respond to new requests.</p>
        <Link href="/dashboard/provider/calendar">
          <Button variant="secondary">View calendar</Button>
        </Link>
      </CardContent>
    </Card>
  );
}
