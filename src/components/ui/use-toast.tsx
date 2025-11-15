"use client";

import * as React from "react";

export type ToastOptions = {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
};

export type Toast = ToastOptions & { id: number };

type ToastContextValue = {
  toasts: Toast[];
  toast: (options: ToastOptions) => void;
  dismiss: (id: number) => void;
};

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = React.useCallback(
    (options: ToastOptions) => {
      const id = Date.now() + Math.random();
      setToasts((current) => [...current, { id, ...options }]);

      // Auto-dismiss after 4 seconds
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  const value = React.useMemo(
    () => ({ toasts, toast, dismiss }),
    [toasts, toast, dismiss],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  return { toast: ctx.toast, toasts: ctx.toasts, dismiss: ctx.dismiss };
}

