"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type Props = {
  bookingId: string;
  shouldSync: boolean;
};

export function PaymentSyncClient({ bookingId, shouldSync }: Props) {
  const router = useRouter();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!shouldSync) return;
    if (startedRef.current) return;
    startedRef.current = true;

    void fetch(`/api/bookings/${encodeURIComponent(bookingId)}/sync-payment`, {
      method: "POST",
      cache: "no-store",
    })
      .catch(() => {
        // ignore; user will still see Stripe status card
      })
      .finally(() => {
        router.refresh();
      });
  }, [bookingId, shouldSync, router]);

  if (!shouldSync) return null;

  return (
    <div className="rounded-md border border-border bg-muted px-4 py-3 text-sm text-foreground">
      <span className="font-medium">Payment received</span>
      {" — updating booking…"}
    </div>
  );
}
