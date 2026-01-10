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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { getBookingStatusLabel, getBookingStatusVariant } from "@/lib/bookings/status";
import { formatBookingPriceLabel } from "@/lib/pricing";

type ProviderBookingStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "paid"
  | "completed_by_provider"
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

const ACTIONS = ["accept", "decline", "cancel", "mark-completed"] as const;
type ProviderAction = (typeof ACTIONS)[number];

export function ProviderBookingsClient() {
  const [bookings, setBookings] = useState<ProviderBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [pendingReasonAction, setPendingReasonAction] = useState<"decline" | "cancel" | null>(null);
  const [pendingBooking, setPendingBooking] = useState<ProviderBooking | null>(null);
  const [reason, setReason] = useState("");
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
    action: ProviderAction,
    actionReason?: string,
  ) => {
    setActionLoading(bookingId + action);
    try {
      const needsReason = action === "decline" || action === "cancel";
      if (needsReason && !actionReason) {
        throw new Error("A reason is required.");
      }

      const res = await fetch("/api/provider/bookings/update-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, action, reason: actionReason }),
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

  const startReasonAction = (booking: ProviderBooking, action: "decline" | "cancel") => {
    setPendingBooking(booking);
    setPendingReasonAction(action);
    setReason("");
    setReasonDialogOpen(true);
  };

  const { requests, upcoming, history } = useMemo(() => {
    const pending = bookings.filter((b) => b.status === "pending");
    const active = bookings.filter((b) => ["accepted", "paid", "completed_by_provider"].includes(b.status));
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
              When customers request your services, you&apos;ll see them here and can accept or
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
                onStartReasonAction={startReasonAction}
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
                onStartReasonAction={startReasonAction}
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
                onStartReasonAction={startReasonAction}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No past bookings yet.</p>
        )}
      </section>

      <Dialog
        open={reasonDialogOpen}
        onOpenChange={(open) => {
          if (!open && !actionLoading) {
            setReasonDialogOpen(false);
            setPendingReasonAction(null);
            setPendingBooking(null);
            setReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingReasonAction === "decline" ? "Decline booking" : "Cancel booking"}
            </DialogTitle>
            <DialogDescription>
              Please provide a short explanation that will be shown to the customer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="provider-booking-reason">
              Reason
            </label>
            <Textarea
              id="provider-booking-reason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Eg. I'm unavailable at that time, or this job is outside my usual scope."
            />
            {pendingBooking ? (
              <p className="text-[11px] text-muted-foreground">
                For: <span className="font-medium text-foreground">{pendingBooking.service.title}</span>
              </p>
            ) : null}
          </div>
          <DialogFooter className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (!actionLoading) {
                  setReasonDialogOpen(false);
                  setPendingReasonAction(null);
                  setPendingBooking(null);
                  setReason("");
                }
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!pendingBooking || !pendingReasonAction || !reason.trim()}
              onClick={async () => {
                if (!pendingBooking || !pendingReasonAction) return;
                await handleUpdateStatus(pendingBooking.id, pendingReasonAction, reason.trim());
                setReasonDialogOpen(false);
                setPendingReasonAction(null);
                setPendingBooking(null);
                setReason("");
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BookingRow(props: {
  booking: ProviderBooking;
  actionLoading: string | null;
  onUpdateStatus: (bookingId: string, action: ProviderAction, actionReason?: string) => void;
  onStartReasonAction: (booking: ProviderBooking, action: "decline" | "cancel") => void;
}) {
  const { booking, actionLoading, onUpdateStatus, onStartReasonAction } = props;
  const isProcessing = (action: ProviderAction) => actionLoading === booking.id + action;

  const scheduled = booking.scheduledDate ? new Date(booking.scheduledDate) : null;
  const dateStr = scheduled ? scheduled.toLocaleDateString() : "Date TBD";
  const timeStr = scheduled
    ? scheduled.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <Card className="overflow-hidden">
      <div className="border-l-4 border-primary">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base leading-tight">
                <Link
                  href={`/dashboard/provider/bookings/${booking.id}`}
                  className="hover:underline"
                >
                  {booking.service.title}
                </Link>
              </CardTitle>
              <CardDescription className="mt-1 text-xs line-clamp-1">
                {[booking.user.firstName, booking.user.lastName].filter(Boolean).join(" ") || "Customer"}
                {booking.user.email ? ` · ${booking.user.email}` : ""}
              </CardDescription>
            </div>
            <Badge variant={getBookingStatusVariant(booking.status)}>
              {getBookingStatusLabel(booking.status)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pb-2">
          <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <CalendarClock className="h-4 w-4" />
                <span>
                  {dateStr}
                  {timeStr && ` at ${timeStr}`}
                </span>
              </div>
              {booking.provider.serviceRadiusKm &&
                (booking.provider.baseSuburb || booking.provider.baseRegion) && (
                  <span className="text-[11px] text-muted-foreground">
                    Service area:{" "}
                    {booking.provider.baseSuburb
                      ? `up to ${booking.provider.serviceRadiusKm} km from ${booking.provider.baseSuburb}`
                      : `up to ${booking.provider.serviceRadiusKm} km in ${booking.provider.baseRegion}`}
                  </span>
                )}
            </div>
            <div className="text-sm font-semibold text-foreground md:text-right">
              {formatBookingPriceLabel(booking.priceAtBooking)}
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="flex flex-wrap gap-2">
            {booking.status === "pending" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onStartReasonAction(booking, "decline")}
                  disabled={isProcessing("decline")}
                  className="text-destructive hover:text-destructive"
                >
                  {isProcessing("decline") ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : null}
                  Reject
                </Button>
                {booking.priceAtBooking === 0 ? (
                  <Button asChild size="sm">
                    <Link href={`/dashboard/provider/bookings/${booking.id}`}>
                      Set price & accept
                    </Link>
                  </Button>
                ) : (
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
                )}
              </>
            )}

            {booking.status === "accepted" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onStartReasonAction(booking, "cancel")}
                  disabled={isProcessing("cancel")}
                >
                  {isProcessing("cancel") ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : null}
                  Cancel booking
                </Button>
                <span className="self-center text-[11px] text-muted-foreground">
                  Waiting for customer payment&mdash;we&apos;ll notify you when it&apos;s paid.
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

            {booking.status === "completed_by_provider" && (
              <span className="self-center text-[11px] text-muted-foreground">
                Waiting for customer confirmation&mdash;funds will be released after they confirm.
              </span>
            )}
          </div>

          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/provider/bookings/${booking.id}`}>
              View details
            </Link>
          </Button>
        </CardFooter>
      </div>
    </Card>
  );
}
