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

function safeGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }
}

function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
    return;
  } catch {
    // ignore
  }
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function isMobileUA() {
  if (typeof navigator === "undefined") return false;
  // Prefer UA-CH when available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navAny = navigator as any;
  if (typeof navAny.userAgentData?.mobile === "boolean") return navAny.userAgentData.mobile;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isMobileScreen() {
  if (typeof window === "undefined") return false;
  // Avoid desktop popups: require a small-ish viewport.
  return window.matchMedia?.("(max-width: 820px)")?.matches ?? window.innerWidth <= 820;
}

function isTouchPrimary() {
  if (typeof window === "undefined") return false;
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const noHover = window.matchMedia?.("(hover: none)")?.matches ?? false;
  return coarse || noHover;
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

  const mobile = useMemo(() => isMobileUA() && isMobileScreen() && isTouchPrimary(), []);

  useEffect(() => {
    if (!mobile) return;
    if (isStandalone()) return;

    const seen = safeGet(STORAGE_KEY);
    if (seen === "1") return;

    const onInstalled = () => {
      safeSet(STORAGE_KEY, "1");
      setOpen(false);
      setDeferred(null);
    };

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setOpen(true);
      safeSet(STORAGE_KEY, "1");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // iOS Safari doesn't emit beforeinstallprompt; show a one-time prompt with instructions.
    if (isIOS()) {
      setOpen(true);
      safeSet(STORAGE_KEY, "1");
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [mobile]);

  if (!mobile) return null;
  if (isStandalone()) return null;

  const showIOS = isIOS();

  async function handleInstall() {
    if (!deferred) {
      safeSet(STORAGE_KEY, "1");
      setOpen(false);
      return;
    }

    try {
      await deferred.prompt();
      await deferred.userChoice;
    } finally {
      setDeferred(null);
      safeSet(STORAGE_KEY, "1");
      setOpen(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Treat any close (esc/outside/cancel) as "don't show again".
        if (!next) safeSet(STORAGE_KEY, "1");
        setOpen(next);
      }}
    >
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
          <AlertDialogCancel onClick={() => safeSet(STORAGE_KEY, "1")}>Not now</AlertDialogCancel>
          {showIOS ? (
            <AlertDialogAction
              onClick={() => {
                safeSet(STORAGE_KEY, "1");
                setOpen(false);
              }}
            >
              Got it
            </AlertDialogAction>
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
