"use client";

import { useState, useEffect, useCallback } from "react";
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
import {
  Loader2,
  AlertTriangle,
  Package,
  CalendarClock,
  CheckCircle2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatPrice } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";

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

interface ProviderBooking {
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
}

const getStatusColor = (status: ProviderBooking["status"]) => {
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

export default function ProviderBookingsPage() {
  const [bookings, setBookings] = useState<ProviderBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  const handleUpdateStatus = async (
    bookingId: string,
    action: "accept" | "decline" | "cancel" | "mark-completed",
  ) => {
    setActionLoading(bookingId);
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

  if (isLoading) {
    return (
      <div className="flex p-12 justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center p-8 text-destructive">
        <AlertTriangle className="mr-2 h-5 w-5" /> {error}
      </div>
    );
  }

  const requests = bookings.filter((b) => b.status === "pending");
  const upcoming = bookings.filter((b) => ["accepted", "paid"].includes(b.status));
  const history = bookings.filter((b) =>
    [
      "completed",
      "canceled_provider",
      "canceled_customer",
      "declined",
      "disputed",
      "refunded",
    ].includes(b.status),
  );

  const BookingCard = ({ booking }: { booking: ProviderBooking }) => {
    const isProcessing = actionLoading === booking.id;
    const scheduled = booking.scheduledDate ? new Date(booking.scheduledDate) : null;
    const dateStr = scheduled ? scheduled.toLocaleDateString() : "Date TBD";
    const timeStr = scheduled
      ? scheduled.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";

    return (
      <Card className="mb-4 overflow-hidden">
        <div className="border-l-4 border-primary h-full">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-lg">{booking.service.title}</CardTitle>
                <CardDescription className="mt-1">
                  {booking.user.firstName} {booking.user.lastName} - {booking.user.email}
                </CardDescription>
              </div>
              <Badge className={getStatusColor(booking.status)} variant="outline">
                {booking.status.toUpperCase()}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pb-2 text-sm">
            <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
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
                  <div className="text-xs text-muted-foreground">
                    Service area:{" "}
                    {booking.provider.baseSuburb
                      ? `up to ${booking.provider.serviceRadiusKm} km from ${booking.provider.baseSuburb}`
                      : `up to ${booking.provider.serviceRadiusKm} km in ${booking.provider.baseRegion}`}
                  </div>
                )}
            </div>
          </CardContent>
          <CardFooter className="pt-2 flex justify-end gap-2">
            {booking.status === "pending" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleUpdateStatus(booking.id, "decline")}
                  disabled={isProcessing}
                  className="text-destructive hover:text-destructive"
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleUpdateStatus(booking.id, "accept")}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Accept Request"
                  )}
                </Button>
              </>
            )}

            {booking.status === "accepted" && (
              <>
                <p className="text-xs text-muted-foreground italic self-center">
                  Waiting for customer payment...
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleUpdateStatus(booking.id, "cancel")}
                  disabled={isProcessing}
                  className="text-destructive hover:text-destructive"
                >
                  Cancel Booking
                </Button>
              </>
            )}

            {booking.status === "paid" && (
              <Button
                size="sm"
                onClick={() => handleUpdateStatus(booking.id, "mark-completed")}
                disabled={isProcessing}
                className="bg-green-600 hover:bg-green-700"
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Mark Complete
                  </>
                )}
              </Button>
            )}
            {booking.status === "disputed" && (
              <p className="text-xs text-muted-foreground italic self-center">
                This booking is disputed. Await resolution.
              </p>
            )}
          </CardFooter>
        </div>
      </Card>
    );
  };

  const EmptyState = ({ message }: { message: string }) => (
    <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg border-dashed">
      <Package className="h-12 w-12 text-muted-foreground mb-3 opacity-50" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <h1 className="text-3xl font-bold mb-6">Manage Bookings</h1>

      <Tabs defaultValue="requests" className="w-full">
        <TabsList className="grid w/full grid-cols-1 sm:grid-cols-3 mb-6">
          <TabsTrigger value="requests">Requests ({requests.length})</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="space-y-4">
          {requests.length > 0 ? (
            requests.map((b) => <BookingCard key={b.id} booking={b} />)
          ) : (
            <EmptyState message="No pending requests." />
          )}
        </TabsContent>

        <TabsContent value="upcoming" className="space-y-4">
          {upcoming.length > 0 ? (
            upcoming.map((b) => <BookingCard key={b.id} booking={b} />)
          ) : (
            <EmptyState message="No upcoming jobs." />
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {history.length > 0 ? (
            history.map((b) => <BookingCard key={b.id} booking={b} />)
          ) : (
            <EmptyState message="No past bookings." />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}


