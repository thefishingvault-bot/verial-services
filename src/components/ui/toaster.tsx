"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast, type Toast } from "@/components/ui/use-toast";

export function Toaster() {
  const { toasts, dismiss } = useToast();

  if (!toasts.length) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast: Toast) => (
        <div
          key={toast.id}
          className={cn(
            "bg-background text-foreground shadow-lg border rounded-md px-4 py-3",
            toast.variant === "destructive" &&
              "border-destructive/50 bg-destructive text-destructive-foreground",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              {toast.title && <p className="font-medium">{toast.title}</p>}
              {toast.description && (
                <p className="text-sm text-muted-foreground">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="text-muted-foreground hover:text-foreground"
            >
              <span className="sr-only">Close</span>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

