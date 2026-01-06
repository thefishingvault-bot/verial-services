"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle } from "lucide-react";

type ProviderKycStatus = "not_started" | "in_progress" | "pending_review" | "verified" | "rejected";

type AccessTokenResponse = {
  token: string;
  expiresAt?: string;
};

declare global {
  interface Window {
    snsWebSdk?: {
      init: (
        accessToken: string,
        refreshToken: () => Promise<string>,
      ) => {
        withConf: (conf: Record<string, unknown>) => any;
        withOptions: (opts: Record<string, unknown>) => any;
        on: (event: string, cb: (...args: any[]) => void) => any;
        build: () => {
          launch: (selector: string) => void;
        };
      };
    };
  }
}

function formatStatus(status: ProviderKycStatus | null) {
  if (!status) return "";
  return status.replace(/_/g, " ");
}

export default function ProviderKycPage() {
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [isLaunching, setIsLaunching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<ProviderKycStatus | null>(null);
  const containerId = "sumsub-websdk";
  const launchedRef = useRef(false);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/provider/kyc/status", { method: "GET" });
      if (!res.ok) return;
      const data = (await res.json()) as { kycStatus?: ProviderKycStatus };
      if (data?.kycStatus) setKycStatus(data.kycStatus);
    } catch {
      // ignore
    }
  }, []);

  const fetchAccessToken = useCallback(async (): Promise<string> => {
    const res = await fetch("/api/provider/kyc/sumsub/access-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || "Failed to generate Sumsub access token.");
    }

    const json = (await res.json()) as AccessTokenResponse;
    if (!json?.token) {
      throw new Error("Sumsub access token missing in response.");
    }
    return json.token;
  }, []);

  const launchSdk = useCallback(async () => {
    setError(null);
    setIsLaunching(true);

    try {
      await refreshStatus();

      if (!scriptLoaded || !window.snsWebSdk?.init) {
        return;
      }

      // Prevent double-mounting the iframe if the component re-renders.
      if (launchedRef.current) {
        setIsLaunching(false);
        return;
      }

      const token = await fetchAccessToken();

      const sdk = window.snsWebSdk
        .init(token, async () => {
          return await fetchAccessToken();
        })
        .withConf({
          lang: "en",
        })
        .withOptions({
          addViewportTag: false,
          adaptIframeHeight: true,
        })
        .on("idCheck.onApplicantSubmitted", async () => {
          await refreshStatus();
        })
        .on("idCheck.onApplicantLoaded", async () => {
          await refreshStatus();
        })
        .on("idCheck.onError", (payload: unknown) => {
          console.warn("[SUMSUB_WEBSDK] onError", payload);
        });

      sdk.build().launch(`#${containerId}`);
      launchedRef.current = true;
      setIsLaunching(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to start identity verification.";
      setError(message);
      setIsLaunching(false);
    }
  }, [fetchAccessToken, refreshStatus, scriptLoaded]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (scriptLoaded) {
      void launchSdk();
    }
  }, [launchSdk, scriptLoaded]);

  const statusCopy = useMemo(() => {
    if (!kycStatus) return null;
    if (kycStatus === "verified") return "Your identity is verified.";
    if (kycStatus === "rejected") return "Your verification was rejected. You can try again.";
    if (kycStatus === "pending_review") return "Submitted — awaiting review.";
    if (kycStatus === "in_progress") return "In progress.";
    return "Not started.";
  }, [kycStatus]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-8">
      <Script
        src="https://static.sumsub.com/idensic/static/sns-websdk-builder.js"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
        onError={() => {
          setError("Failed to load Sumsub WebSDK script.");
          setIsLaunching(false);
        }}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-muted-foreground">Provider onboarding</p>
          <h1 className="text-2xl font-semibold">Identity verification</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete verification to finish setting up your provider account.
          </p>
          {kycStatus && (
            <p className="mt-2 text-xs text-muted-foreground">
              Status: <span className="font-medium text-foreground">{formatStatus(kycStatus)}</span>
              {statusCopy ? <span className="text-muted-foreground"> — {statusCopy}</span> : null}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/register-provider">Back</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/provider">Go to dashboard</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sumsub verification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <div className="flex items-start gap-2 text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <div className="flex-1">
                  <p className="font-medium">Couldn’t start verification</p>
                  <p className="mt-1 text-xs text-muted-foreground">{error}</p>
                </div>
              </div>
              <div className="mt-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    launchedRef.current = false;
                    const el = document.getElementById(containerId);
                    if (el) el.innerHTML = "";
                    void launchSdk();
                  }}
                >
                  Retry
                </Button>
              </div>
            </div>
          ) : null}

          {isLaunching && !error ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading verification…
            </div>
          ) : null}

          <div id={containerId} className="min-h-130" />
        </CardContent>
      </Card>
    </div>
  );
}
