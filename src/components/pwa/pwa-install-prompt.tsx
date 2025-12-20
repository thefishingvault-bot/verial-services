"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const STORAGE_KEY = "verial:pwa-install-prompt:seen:v1";

function isMobileUA() {
  if (typeof navigator === "undefined") return false;
  // Prefer UA-CH when available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navAny = navigator as any;
  if (typeof navAny.userAgentData?.mobile === "boolean") return navAny.userAgentData.mobile;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  // iOS Safari
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navAny = navigator as any;
  if (typeof navAny.standalone === "boolean" && navAny.standalone) return true;
  return window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function PwaInstallPrompt() {
  const [open, setOpen] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  const mobile = useMemo(() => isMobileUA(), []);

  useEffect(() => {
    if (!mobile) return;
    if (isStandalone()) return;

    const seen = window.localStorage.getItem(STORAGE_KEY);
    if (seen === "1") return;

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setOpen(true);
      window.localStorage.setItem(STORAGE_KEY, "1");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    // iOS Safari doesn't emit beforeinstallprompt; show a one-time prompt with instructions.
    if (isIOS()) {
      setOpen(true);
      window.localStorage.setItem(STORAGE_KEY, "1");
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    };
  }, [mobile]);

  if (!mobile) return null;
  if (isStandalone()) return null;

  const showIOS = isIOS();

  async function handleInstall() {
    if (!deferred) {
      setOpen(false);
      return;
    }

    try {
      await deferred.prompt();
      await deferred.userChoice;
    } finally {
      setDeferred(null);
      setOpen(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Install Verial</AlertDialogTitle>
          <AlertDialogDescription>
            {showIOS
              ? "Add Verial to your Home Screen for quicker access. Tap the Share button, then choose \"Add to Home Screen\"."
              : "Install Verial on your device for faster access."
            }
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not now</AlertDialogCancel>
          {showIOS ? (
            <AlertDialogAction onClick={() => setOpen(false)}>Got it</AlertDialogAction>
          ) : (
            <AlertDialogAction onClick={handleInstall} disabled={!deferred}>
              Install
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
