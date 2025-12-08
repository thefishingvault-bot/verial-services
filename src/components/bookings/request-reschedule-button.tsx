"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CalendarClock, Loader2 } from "lucide-react";

interface Props {
  bookingId: string;
  disabled?: boolean;
}

export function RequestRescheduleButton({ bookingId, disabled }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [proposedAt, setProposedAt] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const parsedDate = new Date(proposedAt);
      if (!proposedAt || Number.isNaN(parsedDate.getTime())) {
        setError("Please select a valid date and time");
        return;
      }

      const res = await fetch(`/api/bookings/${bookingId}/reschedule/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposedDate: parsedDate.toISOString(), note: note.trim() || null }),
      });

      if (!res.ok) {
        const text = await res.text();
        setError(text || "Failed to submit reschedule request");
        return;
      }

      setOpen(false);
      setProposedAt("");
      setNote("");
      router.refresh();
    });
  };

  return (
    <>
      <Button variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
        <CalendarClock className="mr-2 h-4 w-4" /> Request reschedule
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a new time</DialogTitle>
            <DialogDescription>Select a new date/time and add context for your provider.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="proposedAt">Proposed date & time</Label>
              <Input
                id="proposedAt"
                type="datetime-local"
                value={proposedAt}
                onChange={(e) => setProposedAt(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Note for provider (optional)</Label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Share any context about why you need to reschedule"
                disabled={isPending}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="flex flex-row justify-between sm:justify-end sm:space-x-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Keep current time
            </Button>
            <Button onClick={submit} disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
