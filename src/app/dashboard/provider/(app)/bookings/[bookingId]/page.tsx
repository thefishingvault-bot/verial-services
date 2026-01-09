import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProviderBookingDetailClient } from "./provider-booking-detail-client";

export default async function ProviderBookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId?: string }>;
}) {
  const { bookingId } = await params;

  if (!bookingId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Booking not found</CardTitle>
            <CardDescription>We couldn’t find that booking.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/provider/bookings">
              <Button variant="outline">Back to bookings</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <ProviderBookingDetailClient bookingId={bookingId} />;
}
