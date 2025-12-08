"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { XCircle } from "lucide-react";

interface Props {
  bookingId: string;
  disabled?: boolean;
}

export function CancelBookingButton({ bookingId, disabled }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });

      if (!res.ok) {
        const text = await res.text();
        setError(text || "Failed to cancel booking");
        return;
      }

      setOpen(false);
      setReason("");
      router.refresh();
    });
  };

  return (
    <>
      <Button variant="destructive" disabled={disabled} onClick={() => setOpen(true)}>
        <XCircle className="mr-2 h-4 w-4" /> Cancel booking
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel booking</DialogTitle>
            <DialogDescription>Optionally share a reason. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for cancelling (optional)"
              disabled={isPending}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="flex flex-row justify-between sm:justify-end sm:space-x-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Keep booking
            </Button>
            <Button variant="destructive" onClick={submit} disabled={isPending}>
              {isPending ? "Cancelling..." : "Confirm cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
