"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getErrorMessage } from "@/lib/api/fetch-json";

export function RequestPayoutButton({ pendingAmountCents }: { pendingAmountCents: number }) {
  const router = useRouter();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = React.useState(false);
  const [isRequested, setIsRequested] = React.useState(false);
  const lastIdempotencyKeyRef = React.useRef<string | null>(null);

  const hasPendingAmount = Number.isFinite(pendingAmountCents) && pendingAmountCents > 0;
  const disabled = !hasPendingAmount || isLoading || isRequested;

  const onClick = async () => {
    if (disabled) return;

    const key = lastIdempotencyKeyRef.current ?? globalThis.crypto?.randomUUID?.() ?? `key_${Date.now()}`;
    lastIdempotencyKeyRef.current = key;

    setIsLoading(true);
    try {
      const res = await fetchJson<{
        ok: true;
        request: {
          id: string;
          amount: number;
          currency: string;
          status: string;
          payoutsDisabled: boolean;
          note: string | null;
        };
      }>("/api/provider/payouts/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: key }),
      });

      toast({
        title: "Payout requested",
        description: res.request.payoutsDisabled
          ? "Request queued (payouts are currently disabled)."
          : "Request queued. We'll process it as soon as possible.",
      });

      setIsRequested(true);

      router.refresh();
    } catch (err) {
      const msg = getErrorMessage(err, "Unable to request payout");
      if (msg) {
        toast({ title: "Error", description: msg, variant: "destructive" });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" onClick={onClick} disabled={disabled}>
        {isLoading ? "Requesting…" : isRequested ? "Requested" : "Request payout"}
      </Button>
      {!hasPendingAmount ? (
        <p className="text-xs text-muted-foreground">No pending payout available yet.</p>
      ) : null}
    </div>
  );
}
