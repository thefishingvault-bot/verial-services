"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Loader2, Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { formatPrice } from "@/lib/utils";

type ProviderBookingStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "paid"
  | "completed"
  | "canceled_customer"
  | "canceled_provider"
  | "disputed"
  | "refunded";

type ProviderBooking = {
  id: string;
  status: ProviderBookingStatus;
  createdAt: string;
  scheduledDate: string | null;
  priceAtBooking: number;
  service: { title: string };
  provider: {
    id: string;
    baseSuburb: string | null;
    baseRegion: string | null;
    serviceRadiusKm: number | null;
  };
  user: { firstName: string | null; lastName: string | null; email: string };
};

const getStatusBadgeClass = (status: ProviderBookingStatus) => {
  switch (status) {
    case "pending":
      return "bg-yellow-100 text-yellow-800 hover:bg-yellow-100";
    case "accepted":
      return "bg-blue-100 text-blue-800 hover:bg-blue-100";
    case "declined":
    case "canceled_provider":
      return "bg-red-100 text-red-800 hover:bg-red-100";
    case "canceled_customer":
      return "bg-orange-100 text-orange-800 hover:bg-orange-100";
    case "paid":
      return "bg-green-100 text-green-800 hover:bg-green-100";
    case "completed":
      return "bg-gray-100 text-gray-800 hover:bg-gray-100";
    case "disputed":
      return "bg-amber-100 text-amber-800 hover:bg-amber-100";
    case "refunded":
      return "bg-slate-100 text-slate-800 hover:bg-slate-100";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

const ACTIONS = ["accept", "decline", "cancel", "mark-completed"] as const;
type ProviderAction = (typeof ACTIONS)[number];

export function ProviderBookingsClient() {
  const [bookings, setBookings] = useState<ProviderBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchBookings = useCallback((signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);

    fetch("/api/provider/bookings/list", { signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch bookings.");
        return res.json();
      })
      .then((data: ProviderBooking[]) => {
        setBookings(data);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message =
          err instanceof Error ? err.message : "Something went wrong loading bookings.";
        setError(message);
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchBookings(controller.signal);
    return () => controller.abort();
  }, [fetchBookings]);

  const handleUpdateStatus = async (bookingId: string, action: ProviderAction) => {
    setActionLoading(bookingId + action);
    try {
      let reason: string | undefined;
      if (action === "decline" || action === "cancel") {
        reason = window.prompt("Please provide a reason (visible to the customer):") || undefined;
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
        throw new Error(text || "Failed to update booking status.");
      }

      toast({ title: `Booking ${action}` });
      fetchBookings();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong updating the booking.";
      toast({ variant: "destructive", title: "Error", description: message });
    } finally {
      setActionLoading(null);
    }
  };

  const { requests, upcoming, history } = useMemo(() => {
    const pending = bookings.filter((b) => b.status === "pending");
    const active = bookings.filter((b) => ["accepted", "paid"].includes(b.status));
    const past = bookings.filter((b) =>
      [
        "completed",
        "canceled_provider",
        "canceled_customer",
        "declined",
        "disputed",
        "refunded",
      ].includes(b.status),
    );
    return { requests: pending, upcoming: active, history: past };
  }, [bookings]);

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-6 text-destructive">
        <AlertTriangle className="h-5 w-5" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!bookings.length) {
    return (
      <Card className="border-dashed">
        <CardHeader className="flex flex-row items-center gap-3">
          <Package className="h-6 w-6 text-muted-foreground" />
          <div>
            <CardTitle className="text-base">No bookings yet</CardTitle>
            <CardDescription>
              When customers request your services, you'll see them here and can accept or
              decline.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-tight">New requests</h2>
        <p className="text-xs text-muted-foreground">
          Review and respond to new booking requests.
        </p>
        {requests.length ? (
          <div className="space-y-3">
            {requests.map((booking) => (
              <BookingRow
                key={booking.id}
                booking={booking}
                actionLoading={actionLoading}
                onUpdateStatus={handleUpdateStatus}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No new requests right now.</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-tight">Upcoming bookings</h2>
        <p className="text-xs text-muted-foreground">
          Confirmed jobs that are scheduled or awaiting payment.
        </p>
        {upcoming.length ? (
          <div className="space-y-3">
            {upcoming.map((booking) => (
              <BookingRow
                key={booking.id}
                booking={booking}
                actionLoading={actionLoading}
                onUpdateStatus={handleUpdateStatus}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No upcoming bookings yet.</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-tight">History</h2>
        <p className="text-xs text-muted-foreground">Completed and cancelled bookings.</p>
        {history.length ? (
          <div className="space-y-3">
            {history.map((booking) => (
              <BookingRow
                key={booking.id}
                booking={booking}
                actionLoading={actionLoading}
                onUpdateStatus={handleUpdateStatus}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No past bookings yet.</p>
        )}
      </section>
    </div>
  );
}

function BookingRow(props: {
  booking: ProviderBooking;
  actionLoading: string | null;
  onUpdateStatus: (bookingId: string, action: ProviderAction) => void;
}) {
  const { booking, actionLoading, onUpdateStatus } = props;
  const isProcessing = (action: ProviderAction) => actionLoading === booking.id + action;

  const scheduled = booking.scheduledDate ? new Date(booking.scheduledDate) : null;
  const dateStr = scheduled ? scheduled.toLocaleDateString() : "Date TBD";
  const timeStr = scheduled
    ? scheduled.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <Card className="overflow-hidden">
      <div className="border-l-4 border-primary">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base leading-tight">{booking.service.title}</CardTitle>
              <CardDescription className="mt-1 text-xs">
                {booking.user.firstName} {booking.user.lastName} · {booking.user.email}
              </CardDescription>
            </div>
            <Badge variant="outline" className={getStatusBadgeClass(booking.status)}>
              {booking.status.toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pb-2 text-xs md:text-sm">
          <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
            <div className="flex items-center gap-1">
              <CalendarClock className="h-4 w-4" />
              <span>
                {dateStr}
                {timeStr && ` at ${timeStr}`}
              </span>
            </div>
            <div className="font-medium text-foreground">
              {formatPrice(booking.priceAtBooking)}
            </div>
            {booking.provider.serviceRadiusKm &&
              (booking.provider.baseSuburb || booking.provider.baseRegion) && (
                <div className="text-[11px] text-muted-foreground">
                  Service area:{" "}
                  {booking.provider.baseSuburb
                    ? `up to ${booking.provider.serviceRadiusKm} km from ${booking.provider.baseSuburb}`
                    : `up to ${booking.provider.serviceRadiusKm} km in ${booking.provider.baseRegion}`}
                </div>
              )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="flex flex-wrap gap-2">
            {booking.status === "pending" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onUpdateStatus(booking.id, "decline")}
                  disabled={isProcessing("decline")}
                  className="text-destructive hover:text-destructive"
                >
                  {isProcessing("decline") ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : null}
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={() => onUpdateStatus(booking.id, "accept")}
                  disabled={isProcessing("accept")}
                >
                  {isProcessing("accept") ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : null}
                  Accept request
                </Button>
              </>
            )}

            {booking.status === "accepted" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onUpdateStatus(booking.id, "cancel")}
                  disabled={isProcessing("cancel")}
                >
                  {isProcessing("cancel") ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : null}
                  Cancel booking
                </Button>
                <span className="self-center text-[11px] text-muted-foreground">
                  Waiting for customer payment&mdash;we'll notify you when it's paid.
                </span>
              </>
            )}

            {booking.status === "paid" && (
              <Button
                size="sm"
                onClick={() => onUpdateStatus(booking.id, "mark-completed")}
                disabled={isProcessing("mark-completed")}
              >
                {isProcessing("mark-completed") ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : null}
                Mark completed
              </Button>
            )}
          </div>

          <Button asChild variant="ghost" size="sm">
            <Link href={`/dashboard/provider/bookings/${booking.id}`}>
              View details
            </Link>
          </Button>
        </CardFooter>
      </div>
    </Card>
  );
}
