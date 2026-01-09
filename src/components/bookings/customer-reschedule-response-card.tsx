"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CalendarClock, CheckCircle2, XCircle } from "lucide-react";

interface Props {
  bookingId: string;
  reschedule: {
    id: string;
    proposedDate: Date | string;
    providerNote: string | null;
    createdAt: Date | string;
  };
}

function formatDateLabel(date: Date) {
  return date.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CustomerRescheduleResponseCard({ bookingId, reschedule }: Props) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const act = (action: "approve" | "decline") => {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/bookings/${bookingId}/reschedule/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rescheduleId: reschedule.id, note: note.trim() || null }),
      });

      if (!res.ok) {
        const text = await res.text();
        setError(text || "Failed to update reschedule proposal");
        return;
      }

      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Pending reschedule</CardTitle>
        <CardDescription>
          Provider proposed <span className="font-semibold">{formatDateLabel(new Date(reschedule.proposedDate))}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {reschedule.providerNote && (
          <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Provider note</p>
            <p className="whitespace-pre-wrap">{reschedule.providerNote}</p>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="customer-note">Your note (optional)</Label>
          <Textarea
            id="customer-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Share context for approving or declining"
            disabled={isPending}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => act("approve")} disabled={isPending}>
            <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
          </Button>
          <Button variant="destructive" onClick={() => act("decline")} disabled={isPending}>
            <XCircle className="mr-2 h-4 w-4" /> Decline
          </Button>
          <div className="flex flex-1 justify-end text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" />
              Proposed {formatDateLabel(new Date(reschedule.createdAt))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
