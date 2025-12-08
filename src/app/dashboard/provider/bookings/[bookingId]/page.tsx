"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { useToast } from "@/components/ui/use-toast";
import { getBookingStatusLabel, getBookingStatusVariant } from "@/lib/bookings/status";

const ACTIONS = {
  accept: "Accept",
  decline: "Decline",
  cancel: "Cancel",
  "mark-completed": "Mark Completed",
} as const;

type ProviderBookingDetail = {
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
    scheduledDate: string | null;
    paymentIntentId: string | null;
    service: { title: string; slug: string };
    user: { firstName: string | null; lastName: string | null; email: string | null };
  };
};

export default function ProviderBookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const bookingId = params.bookingId as string;

  const [data, setData] = useState<ProviderBookingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<keyof typeof ACTIONS | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);

    fetch(`/api/provider/bookings/${bookingId}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load booking");
        return res.json();
      })
      .then((json: ProviderBookingDetail) => {
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

  const handleAction = async (action: keyof typeof ACTIONS) => {
    setActionLoading(action);
    try {
      let reason: string | undefined;
      if (action === "decline" || action === "cancel") {
        reason = window.prompt("Please provide a reason (shown to customer):") || undefined;
        if (!reason) {
          setActionLoading(null);
          return;
        }
      }

      const res = await fetch("/api/provider/bookings/update-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, action, reason }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to update booking");
      }

      toast({ title: `${ACTIONS[action]} successful` });
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Action failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setActionLoading(null);
    }
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
  const scheduled = booking.scheduledDate ? new Date(booking.scheduledDate) : null;

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{booking.service.title}</CardTitle>
          <CardDescription>
            Customer: {booking.user.firstName} {booking.user.lastName} ({booking.user.email})
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Status</span>
            <Badge variant={getBookingStatusVariant(booking.status)}>{getBookingStatusLabel(booking.status)}</Badge>
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
          {booking.status === "pending" && (
            <>
              <Button
                variant="outline"
                onClick={() => handleAction("decline")}
                disabled={actionLoading === "decline"}
              >
                Decline
              </Button>
              <Button
                onClick={() => handleAction("accept")}
                disabled={actionLoading === "accept"}
              >
                Accept
              </Button>
            </>
          )}

          {booking.status === "accepted" && (
            <>
              <Button
                variant="outline"
                onClick={() => handleAction("cancel")}
                disabled={actionLoading === "cancel"}
              >
                Cancel
              </Button>
              <div className="text-xs text-muted-foreground self-center">
                Waiting for customer payment.
              </div>
            </>
          )}

          {booking.status === "paid" && (
            <Button
              onClick={() => handleAction("mark-completed")}
              disabled={actionLoading === "mark-completed"}
            >
              Mark Completed
            </Button>
          )}

          {booking.status === "disputed" && (
            <p className="text-xs text-muted-foreground">This booking is under dispute.</p>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
