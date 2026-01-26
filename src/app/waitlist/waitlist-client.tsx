"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Role = "provider" | "customer";

type WaitlistResponse =
  | {
      status: "created" | "already_exists";
      role: Role;
      email: string;
      suburbCity: string;
      referralCode: string;
      referralLink: string;
      referralCount: number;
    }
  | { error: string; details?: unknown };

function buildWhatsAppShareUrl(link: string) {
  const text = `Join me on the Verial waitlist: ${link}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function buildFacebookShareUrl(link: string) {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`;
}

export function WaitlistClient() {
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref")?.trim() || "";

  const [role, setRole] = useState<Role>("customer");
  const [email, setEmail] = useState("");
  const [suburbCity, setSuburbCity] = useState("");
  const [categoryText, setCategoryText] = useState("");
  const [yearsExperience, setYearsExperience] = useState<string>("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<Extract<WaitlistResponse, { status: string }> | null>(null);

  const referralLink = result?.referralLink || "";
  const shareUrls = useMemo(() => {
    if (!referralLink) return null;
    return {
      whatsapp: buildWhatsAppShareUrl(referralLink),
      facebook: buildFacebookShareUrl(referralLink),
    };
  }, [referralLink]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        role,
        email,
        suburbCity,
        categoryText: role === "provider" ? categoryText : undefined,
        yearsExperience: yearsExperience ? Number(yearsExperience) : undefined,
        ref: ref || undefined,
      };

      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as WaitlistResponse;
      if (!res.ok || "error" in data) {
        const message = "error" in data ? data.error : "Something went wrong";
        toast.error(message);
        return;
      }

      setResult(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyReferralLink() {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      toast.success("Copied link");
    } catch {
      toast.error("Could not copy");
    }
  }

  if (result) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold">You’re on the waitlist</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {result.status === "already_exists" ? "You were already signed up." : "Thanks — we’ll be in touch soon."}
            </p>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-sm font-medium">Your referral link</p>
            <p className="mt-1 break-all text-sm text-muted-foreground">{referralLink}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={copyReferralLink}>
                Copy
              </Button>
              {shareUrls ? (
                <>
                  <Button asChild size="sm" variant="outline">
                    <a href={shareUrls.whatsapp} target="_blank" rel="noreferrer">
                      WhatsApp
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a href={shareUrls.facebook} target="_blank" rel="noreferrer">
                      Facebook
                    </a>
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border bg-background p-3">
            <p className="text-sm">
              You’ve referred <span className="font-semibold">{result.referralCount}</span> people. Refer 3 to move up the list.
            </p>
          </div>

          <Button variant="ghost" onClick={() => setResult(null)}>
            Back
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Join the Verial waitlist</h1>
        <p className="text-sm text-muted-foreground">Be first to know when we launch.</p>
      </div>

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label>Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger>
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="provider">Provider</SelectItem>
              <SelectItem value="customer">Customer</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        </div>

        <div className="space-y-2">
          <Label>Suburb/City</Label>
          <Input value={suburbCity} onChange={(e) => setSuburbCity(e.target.value)} placeholder="e.g. Grey Lynn, Auckland" required />
        </div>

        {role === "provider" ? (
          <>
            <div className="space-y-2">
              <Label>What service do you provide?</Label>
              <Input
                value={categoryText}
                onChange={(e) => setCategoryText(e.target.value)}
                placeholder="e.g. House cleaning, Lawn mowing, IT support"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Years experience (optional)</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={80}
                value={yearsExperience}
                onChange={(e) => setYearsExperience(e.target.value)}
                placeholder="e.g. 5"
              />
            </div>
          </>
        ) : null}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Submitting…" : "Join waitlist"}
        </Button>

        {ref ? (
          <p className="text-xs text-muted-foreground">
            Referral applied: <span className="font-mono">{ref}</span>
          </p>
        ) : null}
      </form>
    </Card>
  );
}
