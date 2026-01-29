"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type AdminWaitlistRow = {
  id: string;
  createdAtIso: string;
  role: "provider" | "customer";
  email: string;
  emailLower: string;
  suburbCity: string;
  categoryText: string | null;
  yearsExperience: number | null;
  referralCode: string;
  referredById: string | null;
  referralCount: number;
  alreadyHasAccess: boolean;
};

type InviteResult = {
  id: string;
  email: string;
  status: string;
  inviteUrlCurrent: string;
  inviteUrlPublic: string;
  emailStatus: "not_sent" | "sent" | "failed";
  emailSentAt: string | null;
  emailResendId: string | null;
  emailError: string | null;
};

type CreateInvitesResponse =
  | { ok: true; invites: InviteResult[]; errorBanner: string | null }
  | { error: string; details?: unknown };

export function AdminWaitlistInteractive(props: {
  rows: AdminWaitlistRow[];
  referredByEmailById: Record<string, string>;
}) {
  const { rows, referredByEmailById } = props;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [notes, setNotes] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<InviteResult[] | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [testEmail, setTestEmail] = useState("");
  const [isSendingTest, setIsSendingTest] = useState(false);

  const [localAccessEmailLowers, setLocalAccessEmailLowers] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const r of rows) {
      if (r.alreadyHasAccess) s.add(r.emailLower);
    }
    return s;
  });

  const selectableProviderRows = useMemo(() => {
    return rows.filter((r) => r.role === "provider" && !localAccessEmailLowers.has(r.emailLower));
  }, [rows, localAccessEmailLowers]);

  const selectedProviderRows = useMemo(() => {
    return rows.filter((r) => selectedIds.has(r.id) && r.role === "provider");
  }, [rows, selectedIds]);

  const selectedProviderCount = selectedProviderRows.length;

  const headerCheckboxState = useMemo(() => {
    if (selectableProviderRows.length === 0) return false;
    const selectedCount = selectableProviderRows.filter((r) => selectedIds.has(r.id)).length;
    if (selectedCount === 0) return false;
    if (selectedCount === selectableProviderRows.length) return true;
    return "indeterminate" as const;
  }, [selectableProviderRows, selectedIds]);

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectAllOnPage(value: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (value) {
        for (const r of selectableProviderRows) next.add(r.id);
      } else {
        for (const r of selectableProviderRows) next.delete(r.id);
      }
      return next;
    });
  }

  async function generateInvites() {
    const emails = selectedProviderRows.map((r) => r.email);
    if (emails.length === 0) return;

    setIsGenerating(true);
    try {
      const res = await fetch("/api/admin/provider-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails, notes: notes.trim() || undefined }),
      });

      const data = (await res.json()) as CreateInvitesResponse;
      if (!res.ok || "error" in data) {
        toast.error("error" in data ? data.error : "Failed to generate invites");
        return;
      }

      setResults(data.invites);
      setErrorBanner(data.errorBanner);

      // Mark those emails as having access now (so they become unselectable immediately).
      const createdLower = new Set(data.invites.map((i) => i.email.toLowerCase()));
      setLocalAccessEmailLowers((prev) => {
        const next = new Set(prev);
        for (const e of createdLower) next.add(e);
        return next;
      });

      // Clear selection for any rows we just processed.
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const r of selectedProviderRows) {
          if (createdLower.has(r.emailLower)) next.delete(r.id);
        }
        return next;
      });

      toast.success(`Generated ${data.invites.length} invite${data.invites.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate invites");
    } finally {
      setIsGenerating(false);
    }
  }

  async function sendTestInvite() {
    const email = testEmail.trim();
    if (!email) {
      toast.error("Enter an email address");
      return;
    }

    setIsSendingTest(true);
    try {
      const res = await fetch("/api/admin/provider-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: [email], notes: "test_invite" }),
      });

      const data = (await res.json()) as CreateInvitesResponse;
      if (!res.ok || "error" in data) {
        toast.error("error" in data ? data.error : "Failed to send test invite");
        return;
      }

      setResults(data.invites);
      setErrorBanner(data.errorBanner);
      toast.success("Test invite processed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send test invite");
    } finally {
      setIsSendingTest(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  const copyAllText = useMemo(() => {
    if (!results || results.length === 0) return "";
    return results.map((r) => r.inviteUrlCurrent || r.inviteUrlPublic).join("\n");
  }, [results]);

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold">Early Access for Providers</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Grant early access invite links to selected providers so they can bypass the waitlist.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">{selectedProviderCount} providers selected</p>
            <Button type="button" disabled={selectedProviderCount === 0 || isGenerating} onClick={generateInvites}>
              {isGenerating ? "Generating…" : "Generate invites"}
            </Button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex-1 space-y-2">
              <label className="text-xs text-muted-foreground">Send test invite email (optional)</label>
              <Input
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="provider@example.com"
                className="h-9"
              />
            </div>
            <Button type="button" variant="outline" disabled={isSendingTest} onClick={sendTestInvite}>
              {isSendingTest ? "Sending…" : "Send test invite"}
            </Button>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Notes (optional)</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Auckland launch batch #1" />
          </div>

          {errorBanner ? (
            <div className="rounded-lg border border-destructive bg-destructive/5 p-3 text-sm text-destructive">
              {errorBanner}
            </div>
          ) : null}

          {results && results.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium">Generated invite links</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!copyAllText}
                  onClick={() => copy(copyAllText)}
                >
                  Copy all links
                </Button>
              </div>

              <div className="space-y-2">
                {results.map((r) => {
                  const url = r.inviteUrlCurrent || r.inviteUrlPublic;
                  const statusBadge =
                    r.emailStatus === "sent"
                      ? <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/20" variant="outline">Sent ✅</Badge>
                      : r.emailStatus === "failed"
                        ? <Badge className="bg-destructive/10 text-destructive border-destructive/20" variant="outline">Failed ❌</Badge>
                        : <Badge variant="secondary">Not sent</Badge>;

                  return (
                    <div key={r.id} className="rounded-lg border bg-muted/20 p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{r.email}</p>
                            {statusBadge}
                          </div>
                          {r.emailResendId ? (
                            <p className="text-xs text-muted-foreground">resend_id: {r.emailResendId}</p>
                          ) : null}
                          {r.emailError ? (
                            <p className="text-xs text-destructive wrap-break-word">{r.emailError}</p>
                          ) : null}
                        </div>
                        <Button type="button" size="sm" variant="outline" onClick={() => copy(url)}>
                          Copy link
                        </Button>
                      </div>
                      <p className="mt-2 break-all text-xs text-muted-foreground">{url}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-11">
                <div className="flex items-center justify-center">
                  <Checkbox
                    checked={headerCheckboxState}
                    onCheckedChange={(v) => toggleSelectAllOnPage(v === true)}
                    aria-label="Select all providers on this page"
                    disabled={selectableProviderRows.length === 0}
                  />
                </div>
              </TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Suburb/City</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Years</TableHead>
              <TableHead>Referral code</TableHead>
              <TableHead>Referred by</TableHead>
              <TableHead className="text-right">Referrals</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                  No results.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const hasAccess = localAccessEmailLowers.has(r.emailLower);
                const isSelectable = r.role === "provider" && !hasAccess;
                const isSelected = selectedIds.has(r.id);

                return (
                  <TableRow key={r.id} className={isSelected ? "bg-muted/30" : undefined}>
                    <TableCell>
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={isSelected}
                          disabled={!isSelectable}
                          onCheckedChange={(v) => toggleRow(r.id, v === true)}
                          aria-label={isSelectable ? `Select ${r.email}` : "Not selectable"}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{r.createdAtIso.slice(0, 10)}</TableCell>
                    <TableCell className="capitalize">
                      <div className="flex items-center gap-2">
                        <span>{r.role}</span>
                        {hasAccess ? <Badge variant="secondary">Already has access</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-55 truncate">{r.email}</TableCell>
                    <TableCell className="max-w-55 truncate">{r.suburbCity}</TableCell>
                    <TableCell className="max-w-55 truncate">{r.categoryText ?? ""}</TableCell>
                    <TableCell>{r.yearsExperience ?? ""}</TableCell>
                    <TableCell className="font-mono text-xs">{r.referralCode}</TableCell>
                    <TableCell className="max-w-55 truncate text-xs text-muted-foreground">
                      {r.referredById ? referredByEmailById[r.referredById] ?? r.referredById : ""}
                    </TableCell>
                    <TableCell className="text-right">{Number(r.referralCount ?? 0)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
