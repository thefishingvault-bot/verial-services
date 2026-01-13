"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ParsedProviderSuspendedPayload } from "@/lib/errors/provider-suspension";
import { PROVIDER_SUSPENDED_EVENT } from "@/lib/errors/provider-suspension";

function formatNzLocal(value: Date | null) {
  if (!value) return "—";
  try {
    return value.toLocaleString("en-NZ", {
      timeZone: "Pacific/Auckland",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value.toISOString();
  }
}

export function ProviderLimitedModePopup() {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<ParsedProviderSuspendedPayload | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as ParsedProviderSuspendedPayload | undefined;
      if (!detail) return;
      setPayload(detail);
      setOpen(true);
    };

    window.addEventListener(PROVIDER_SUSPENDED_EVENT, handler as EventListener);
    return () => window.removeEventListener(PROVIDER_SUSPENDED_EVENT, handler as EventListener);
  }, []);

  const fields = useMemo(() => {
    return {
      reason: payload?.reason ?? "—",
      starts: formatNzLocal(payload?.startsAt ?? null),
      ends: formatNzLocal(payload?.endsAt ?? null),
    };
  }, [payload]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Limited mode</AlertDialogTitle>
          <AlertDialogDescription>
            {payload?.message ?? "Your account is in limited mode and cannot perform this action."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 text-sm">
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <div className="text-muted-foreground">Status</div>
            <div>Limited mode</div>
          </div>
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <div className="text-muted-foreground">Reason</div>
            <div>{fields.reason}</div>
          </div>
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <div className="text-muted-foreground">Starts</div>
            <div>{fields.starts}</div>
          </div>
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <div className="text-muted-foreground">Ends</div>
            <div>{fields.ends}</div>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogAction>OK</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
