"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type InviteResult = {
  id: string;
  email: string;
  status: string;
  inviteUrlCurrent: string;
  inviteUrlPublic: string;
};

type CreateInvitesResponse =
  | { ok: true; invites: InviteResult[] }
  | { error: string; details?: unknown };

function parseEmails(raw: string) {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function WaitlistAdminClient() {
  const [singleEmail, setSingleEmail] = useState("");
  const [bulkEmails, setBulkEmails] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invites, setInvites] = useState<InviteResult[] | null>(null);

  const bulkCount = useMemo(() => parseEmails(bulkEmails).length, [bulkEmails]);

  async function createInvites(emails: string[]) {
    if (emails.length === 0) {
      toast.error("Enter at least one email");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/provider-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails, notes: notes.trim() || undefined }),
      });

      const data = (await res.json()) as CreateInvitesResponse;
      if (!res.ok || "error" in data) {
        toast.error("error" in data ? data.error : "Failed to create invites");
        return;
      }

      setInvites(data.invites);
      toast.success(`Created ${data.invites.length} invite${data.invites.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create invites");
    } finally {
      setIsSubmitting(false);
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

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-sm font-medium">Create provider invites</p>

        <div className="space-y-2">
          <Label>Single email</Label>
          <div className="flex gap-2">
            <Input
              value={singleEmail}
              onChange={(e) => setSingleEmail(e.target.value)}
              placeholder="provider@example.com"
            />
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => createInvites(parseEmails(singleEmail))}
            >
              Create
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Bulk emails (comma, space, or newline separated)</Label>
          <Textarea
            value={bulkEmails}
            onChange={(e) => setBulkEmails(e.target.value)}
            placeholder={"a@example.com\nb@example.com\nc@example.com"}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{bulkCount} detected</p>
            <Button
              type="button"
              disabled={isSubmitting || bulkCount === 0}
              onClick={() => createInvites(parseEmails(bulkEmails))}
            >
              Create {bulkCount === 0 ? "invites" : bulkCount === 1 ? "invite" : "invites"}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Notes (optional)</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Auckland launch batch #1" />
        </div>
      </div>

      {invites && invites.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">Invite links</p>
          <div className="space-y-2">
            {invites.map((i) => (
              <div key={i.id} className="rounded-lg border bg-muted/20 p-3">
                <p className="text-sm font-medium">{i.email}</p>
                <div className="mt-2 space-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Public URL</p>
                    <p className="break-all text-xs text-muted-foreground">{i.inviteUrlPublic}</p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" type="button" onClick={() => copy(i.inviteUrlPublic)}>
                        Copy
                      </Button>
                      <Button size="sm" variant="outline" type="button" onClick={() => window.open(i.inviteUrlPublic, "_blank", "noopener,noreferrer")}>
                        Open
                      </Button>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Current-origin URL</p>
                    <p className="break-all text-xs text-muted-foreground">{i.inviteUrlCurrent}</p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" type="button" onClick={() => copy(i.inviteUrlCurrent)}>
                        Copy
                      </Button>
                      <Button size="sm" variant="outline" type="button" onClick={() => window.open(i.inviteUrlCurrent, "_blank", "noopener,noreferrer")}>
                        Open
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
