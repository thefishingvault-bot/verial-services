"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type ProviderStatus = "pending" | "approved" | "rejected";

interface AdminProviderModerationControlsProps {
  providerId: string;
  status: ProviderStatus;
  isVerified: boolean;
  isSuspended: boolean;
}

async function postJson(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json().catch(() => undefined);
}

async function patchJson(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json().catch(() => undefined);
}

export function AdminProviderModerationControls({
  providerId,
  status,
  isVerified,
  isSuspended,
}: AdminProviderModerationControlsProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      setPendingAction(label);
      setError(null);
      await fn();
      router.refresh();
    } catch (err) {
      console.error(`[ADMIN_ACTION:${label}]`, err);
      setError("Action failed. Please try again.");
    } finally {
      setPendingAction(null);
    }
  };

  const approve = () => run("approve", () => postJson("/api/admin/verify-provider", { providerId, newStatus: "approved" }));
  const reject = () => run("reject", () => postJson("/api/admin/verify-provider", { providerId, newStatus: "rejected" }));
  const toggleVerified = () => run("verify", () => patchJson(`/api/admin/providers/${providerId}/verification`, { isVerified: !isVerified }));
  const ban = () => run("ban", () => postJson(`/api/admin/providers/${providerId}/ban`, { reason: "Banned via admin dashboard" }));

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap gap-2">
        {status === "pending" && (
          <>
            <Button size="sm" variant="outline" onClick={approve} disabled={pendingAction !== null}>
              {pendingAction === "approve" && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}Approve provider
            </Button>
            <Button size="sm" variant="outline" onClick={reject} disabled={pendingAction !== null}>
              {pendingAction === "reject" && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}Reject provider
            </Button>
          </>
        )}

        <Button size="sm" variant="outline" onClick={toggleVerified} disabled={pendingAction !== null}>
          {pendingAction === "verify" && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
          {isVerified ? "Remove verified badge" : "Mark as verified"}
        </Button>

        <Button size="sm" variant="outline" onClick={ban} disabled={pendingAction !== null || isSuspended}>
          {pendingAction === "ban" && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
          {isSuspended ? "Already banned" : "Ban provider"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {isSuspended && <p className="text-xs text-muted-foreground">Provider is currently suspended/banned.</p>}
    </div>
  );
}