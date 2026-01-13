"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

import { useToast } from "@/components/ui/use-toast";
import { getBookingStatusLabel, getBookingStatusVariant } from "@/lib/bookings/status";
import { formatBookingPriceLabel } from "@/lib/pricing";
import { fetchJson, getErrorMessage } from "@/lib/api/fetch-json";

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
      | "completed_by_provider"
      | "completed"
      | "canceled_customer"
      | "canceled_provider"
      | "disputed"
      | "refunded";
    priceAtBooking: number;
    scheduledDate: string | null;
    paymentIntentId: string | null;
    providerMessage?: string | null;
    providerDeclineReason?: string | null;
    providerQuotedPrice?: number | null;
    service: { title: string; slug: string };
    user: { id: string; firstName: string | null; lastName: string | null; email: string | null };
  };
  pendingReschedule?: {
    id: string;
    status: "pending";
    proposedDate: Date | string;
    customerNote: string | null;
    providerNote: string | null;
    requesterId: string;
    createdAt: Date | string;
  } | null;
};

export function ProviderBookingDetailClient({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const { toast } = useToast();

  const [data, setData] = useState<ProviderBookingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<keyof typeof ACTIONS | null>(null);
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"decline" | "cancel" | null>(null);
  const [reason, setReason] = useState("");
  const [messageToCustomer, setMessageToCustomer] = useState("");
  const [finalPriceNzd, setFinalPriceNzd] = useState("");

  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [rescheduleProposedAt, setRescheduleProposedAt] = useState("");
  const [rescheduleNote, setRescheduleNote] = useState("");
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [isReschedulePending, startRescheduleTransition] = useTransition();

  const loadBooking = useCallback(
    async (signal?: AbortSignal) => {
      const res = await fetch(`/api/provider/bookings/${bookingId}`, { signal });
      if (!res.ok) throw new Error("Booking not found");
      const json = (await res.json()) as ProviderBookingDetail;
      setData(json);
    },
    [bookingId],
  );

  useEffect(() => {
    if (!bookingId) return;

    const controller = new AbortController();
    setIsLoading(true);

    loadBooking(controller.signal)
      .then(() => {
        setError(null);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Booking not found");
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [bookingId, loadBooking]);

  const refreshBooking = useCallback(async () => {
    try {
      await loadBooking();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Refresh failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [loadBooking, toast]);

  const handleAction = async (action: keyof typeof ACTIONS, actionReason?: string, providerMessage?: string | null) => {
    setActionLoading(action);
    try {
      const isQuoteFlow = data?.booking.status === "pending" && data.booking.priceAtBooking === 0;
      const finalPriceInCents =
        action === "accept" && data?.booking.priceAtBooking === 0
          ? Math.round((parseFloat(finalPriceNzd) || 0) * 100)
          : undefined;

      await fetchJson("/api/provider/bookings/update-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          action,
          ...(action === "decline"
            ? { declineReason: actionReason }
            : action === "cancel"
              ? { cancelReason: actionReason }
              : {}),
          providerMessage: providerMessage ?? undefined,
          finalPriceInCents,
        }),
      });

      if (action === "accept") {
        toast({ title: isQuoteFlow ? "Quote sent" : "Booking accepted" });
      } else if (action === "decline") {
        toast({ title: isQuoteFlow ? "Quote declined" : "Booking declined" });
      } else {
        toast({ title: `${ACTIONS[action]} successful` });
      }

      if (action === "accept" || action === "decline") {
        router.replace("/dashboard/provider/bookings");
        setTimeout(() => router.refresh(), 0);
        return;
      }

      await refreshBooking();
    } catch (err) {
      const message = getErrorMessage(err, "Unknown error");
      if (message) {
        toast({
          variant: "destructive",
          title: "Action failed",
          description: message,
        });
      }
    } finally {
      setActionLoading(null);
    }
  };

  const startReasonAction = (action: "decline" | "cancel") => {
    setPendingAction(action);
    setReason("");
    setReasonDialogOpen(true);
  };

  const submitRescheduleRequest = (opts?: { declineExistingRescheduleId?: string }) => {
    setRescheduleError(null);
    startRescheduleTransition(async () => {
      try {
        if (!data) return;
        const parsed = new Date(rescheduleProposedAt);
        if (!rescheduleProposedAt || Number.isNaN(parsed.getTime())) {
          setRescheduleError("Please select a valid date and time");
          return;
        }

        if (opts?.declineExistingRescheduleId) {
          await fetch(`/api/bookings/${bookingId}/reschedule/respond`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "decline",
              rescheduleId: opts.declineExistingRescheduleId,
              note: rescheduleNote.trim() || null,
            }),
          }).catch(() => null);
        }

        const res = await fetch(`/api/bookings/${bookingId}/reschedule/request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposedDate: parsed.toISOString(), note: rescheduleNote.trim() || null }),
        });

        if (!res.ok) {
          const text = await res.text();
          setRescheduleError(text || "Failed to submit reschedule request");
          return;
        }

        toast({ title: "Reschedule sent" });
        setRescheduleDialogOpen(false);
        setRescheduleProposedAt("");
        setRescheduleNote("");
        await refreshBooking();
      } catch (err) {
        setRescheduleError(err instanceof Error ? err.message : "Failed to submit reschedule request");
      }
    });
  };

  const respondToReschedule = (action: "approve" | "decline", rescheduleId: string) => {
    setRescheduleError(null);
    startRescheduleTransition(async () => {
      const res = await fetch(`/api/bookings/${bookingId}/reschedule/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rescheduleId, note: rescheduleNote.trim() || null }),
      });

      if (!res.ok) {
        const text = await res.text();
        setRescheduleError(text || "Failed to update reschedule request");
        return;
      }

      toast({ title: action === "approve" ? "Reschedule approved" : "Reschedule declined" });
      setRescheduleNote("");
      await refreshBooking();
    });
  };

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

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Booking not found</CardTitle>
            <CardDescription>{error ?? "We couldn’t find that booking."}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              <span>Please try again, or go back to your bookings.</span>
            </div>
            <Link href="/dashboard/provider/bookings">
              <Button variant="outline">Back to bookings</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { booking } = data;
  const scheduled = booking.scheduledDate ? new Date(booking.scheduledDate) : null;
  const isSubmitting = actionLoading !== null;
  const pendingReschedule = data.pendingReschedule ?? null;
  const canReschedule = booking.status === "accepted" || booking.status === "paid";
  const pendingRequestedByCustomer = !!pendingReschedule && pendingReschedule.requesterId === booking.user.id;

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
            <div className="font-semibold">{formatBookingPriceLabel(booking.priceAtBooking)}</div>
            {booking.status === "pending" && booking.priceAtBooking === 0 && (
              <div className="mt-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="final-price">
                  Final price (NZD)
                </label>
                <Input
                  id="final-price"
                  type="number"
                  step="0.01"
                  placeholder="e.g., 150.00"
                  value={finalPriceNzd}
                  onChange={(e) => setFinalPriceNzd(e.target.value)}
                />
                <div className="text-xs text-muted-foreground mt-1">Required to accept quote requests.</div>
              </div>
            )}
          </div>

          {booking.status === "pending" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="provider-message">
                Message to customer (optional)
              </label>
              <Textarea
                id="provider-message"
                rows={4}
                value={messageToCustomer}
                onChange={(e) => setMessageToCustomer(e.target.value)}
                placeholder="Add any helpful details for the customer"
              />
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          {booking.status === "pending" && (
            <>
              <Button variant="outline" onClick={() => startReasonAction("decline")} disabled={isSubmitting}>
                {actionLoading === "decline" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Decline
                  </>
                ) : (
                  "Decline"
                )}
              </Button>
              <Button
                onClick={() => handleAction("accept", undefined, messageToCustomer.trim() || null)}
                disabled={isSubmitting || (booking.priceAtBooking === 0 && !(parseFloat(finalPriceNzd) > 0))}
              >
                {actionLoading === "accept" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Accept
                  </>
                ) : (
                  "Accept"
                )}
              </Button>
            </>
          )}

          {booking.status === "accepted" && (
            <>
              <Button variant="outline" onClick={() => startReasonAction("cancel")} disabled={isSubmitting}>
                {actionLoading === "cancel" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cancel
                  </>
                ) : (
                  "Cancel"
                )}
              </Button>
              <div className="text-xs text-muted-foreground self-center">Waiting for customer payment.</div>
            </>
          )}

          {booking.status === "paid" && (
            <Button onClick={() => handleAction("mark-completed")} disabled={isSubmitting}>
              {actionLoading === "mark-completed" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Mark Completed
                </>
              ) : (
                "Mark Completed"
              )}
            </Button>
          )}

          {booking.status === "completed_by_provider" && (
            <div className="text-xs text-muted-foreground self-center">
              Waiting for customer confirmation&mdash;funds will be released after they confirm.
            </div>
          )}

          {booking.status === "disputed" && <p className="text-xs text-muted-foreground">This booking is under dispute.</p>}
        </CardFooter>
      </Card>

      {canReschedule && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Reschedule</CardTitle>
            <CardDescription>Propose or respond to time changes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {pendingReschedule ? (
              <>
                <div>
                  <span className="text-muted-foreground">Proposed time</span>
                  <div className="font-semibold">{new Date(pendingReschedule.proposedDate).toLocaleString()}</div>
                </div>
                {pendingRequestedByCustomer && pendingReschedule.customerNote && (
                  <div className="rounded-md bg-muted p-3">
                    <div className="font-medium text-foreground">Customer note</div>
                    <div className="whitespace-pre-wrap text-muted-foreground">{pendingReschedule.customerNote}</div>
                  </div>
                )}
                {!pendingRequestedByCustomer && pendingReschedule.providerNote && (
                  <div className="rounded-md bg-muted p-3">
                    <div className="font-medium text-foreground">Your note</div>
                    <div className="whitespace-pre-wrap text-muted-foreground">{pendingReschedule.providerNote}</div>
                  </div>
                )}

                {pendingRequestedByCustomer ? (
                  <>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground" htmlFor="reschedule-note">
                        Your note (optional)
                      </label>
                      <Textarea
                        id="reschedule-note"
                        rows={3}
                        value={rescheduleNote}
                        onChange={(e) => setRescheduleNote(e.target.value)}
                        placeholder="Share context for approving or proposing a different time"
                        disabled={isReschedulePending}
                      />
                    </div>
                    {rescheduleError && <p className="text-sm text-destructive">{rescheduleError}</p>}
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => respondToReschedule("approve", pendingReschedule.id)} disabled={isReschedulePending}>
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => respondToReschedule("decline", pendingReschedule.id)}
                        disabled={isReschedulePending}
                      >
                        Decline
                      </Button>
                      <Button variant="outline" onClick={() => setRescheduleDialogOpen(true)} disabled={isReschedulePending}>
                        Propose different time
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Proposing a different time will decline the current request.</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Waiting for the customer to respond.</p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">No pending reschedule requests.</p>
                <Button variant="outline" onClick={() => setRescheduleDialogOpen(true)}>
                  Propose new time
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={reasonDialogOpen}
        onOpenChange={(open: boolean) => {
          if (!open && !actionLoading) {
            setReasonDialogOpen(false);
            setPendingAction(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingAction === "decline" ? "Decline booking" : "Cancel booking"}</DialogTitle>
            <DialogDescription>Please provide a short explanation that will be shown to the customer.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="booking-reason">
              Reason
            </label>
            <Textarea
              id="booking-reason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Eg. I’m unavailable at that time, or this job is outside my usual scope."
            />
          </div>

          {pendingAction === "decline" ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="booking-message">
                Message to customer (optional)
              </label>
              <Textarea
                id="booking-message"
                rows={3}
                value={messageToCustomer}
                onChange={(e) => setMessageToCustomer(e.target.value)}
                placeholder="Optional additional context"
              />
            </div>
          ) : null}
          <DialogFooter className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (!actionLoading) {
                  setReasonDialogOpen(false);
                  setPendingAction(null);
                }
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              disabled={!pendingAction || !reason.trim() || isSubmitting}
              onClick={async () => {
                if (!pendingAction || !reason.trim()) return;
                await handleAction(
                  pendingAction,
                  reason.trim(),
                  pendingAction === "decline" ? messageToCustomer.trim() || null : null,
                );
                setReasonDialogOpen(false);
                setPendingAction(null);
                setReason("");
              }}
            >
              {actionLoading === pendingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rescheduleDialogOpen}
        onOpenChange={(open: boolean) => {
          if (!open && !isReschedulePending) {
            setRescheduleDialogOpen(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Propose a new time</DialogTitle>
            <DialogDescription>Pick a new date/time and optionally add a note.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="proposedAt">
                Proposed date & time
              </label>
              <Input
                id="proposedAt"
                type="datetime-local"
                value={rescheduleProposedAt}
                onChange={(e) => setRescheduleProposedAt(e.target.value)}
                disabled={isReschedulePending}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="note">
                Note (optional)
              </label>
              <Textarea
                id="note"
                value={rescheduleNote}
                onChange={(e) => setRescheduleNote(e.target.value)}
                placeholder="Share any context about the new time"
                disabled={isReschedulePending}
              />
            </div>
            {rescheduleError && <p className="text-sm text-destructive">{rescheduleError}</p>}
          </div>
          <DialogFooter className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (!isReschedulePending) setRescheduleDialogOpen(false);
              }}
              disabled={isReschedulePending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (pendingReschedule && pendingRequestedByCustomer) {
                  submitRescheduleRequest({ declineExistingRescheduleId: pendingReschedule.id });
                  return;
                }
                submitRescheduleRequest();
              }}
              disabled={isReschedulePending}
            >
              {isReschedulePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
