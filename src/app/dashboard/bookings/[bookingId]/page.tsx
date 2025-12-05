"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, Loader2, MessageSquare } from "lucide-react";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type BookingDetailResponse = {
  booking: {
    id: string;
    status:
      | "pending"
      | "accepted"
      | "declined"
      | "paid"
      | "completed"
      | "canceled_customer"
      | "canceled_provider"
      | "disputed"
      | "refunded";
    priceAtBooking: number;
    paymentIntentId: string | null;
    scheduledDate: string | null;
    service: { title: string; slug: string };
    provider: {
      id: string;
      businessName: string;
      handle: string;
      stripeConnectId: string | null;
      baseRegion: string | null;
      baseSuburb: string | null;
      serviceRadiusKm: number | null;
      user?: { firstName: string | null; lastName: string | null; email: string | null };
    };
  };
};

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = params.bookingId as string;

  const [data, setData] = useState<BookingDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);

    fetch(`/api/bookings/${bookingId}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load booking");
        return res.json();
      })
      .then((json: BookingDetailResponse) => {
        setData(json);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load booking");
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [bookingId]);

  const handleCancel = async () => {
    if (!confirm("Cancel this booking?")) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/bookings/cancel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel booking");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePay = () => {
    router.push(`/checkout/${bookingId}`);
  };

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-destructive">
        <AlertTriangle className="h-5 w-5 mr-2" />
        <p>{error ?? "Booking not found"}</p>
      </div>
    );
  }

  const { booking } = data;
  const status = booking.status;
  const scheduled = booking.scheduledDate ? new Date(booking.scheduledDate) : null;

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{booking.service.title}</CardTitle>
          <CardDescription>
            Provider: {booking.provider.businessName} (@{booking.provider.handle})
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Status</span>
            <Badge>{status.toUpperCase()}</Badge>
          </div>
          <div>
            <span className="text-muted-foreground">Scheduled</span>
            <div>{scheduled ? scheduled.toLocaleString() : "To be scheduled"}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Price</span>
            <div className="font-semibold">${(booking.priceAtBooking / 100).toFixed(2)}</div>
          </div>
          <div className="text-muted-foreground text-xs">
            Payment Intent: {booking.paymentIntentId || "not created"}
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          {(status === "pending" || status === "accepted") && (
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={actionLoading}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
          )}
          {status === "accepted" && (
            <Button onClick={handlePay} disabled={actionLoading} className="w-full sm:w-auto">
              Pay Now
            </Button>
          )}
          <Button variant="outline" onClick={() => router.push(`/dashboard/messages`)}>
            <MessageSquare className="h-4 w-4 mr-2" /> Message Provider
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
