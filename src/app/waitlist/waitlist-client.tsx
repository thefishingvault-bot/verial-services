"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

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

  const subtitle = role === "provider"
    ? "Get early access and priority placement when we launch."
    : "Be first to book trusted local providers when we launch.";

  const finalHowItWorks = role === "provider"
    ? "Start getting bookings"
    : "Book local services in minutes";

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Join the Verial waitlist</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
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
                <p className="text-xs text-muted-foreground">Example: House cleaning, Lawn mowing, IT support</p>
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
                <p className="text-xs text-muted-foreground">Optional. Enter a number from 0–80.</p>
              </div>
            </>
          ) : null}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Submitting…" : "Join waitlist"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">No spam. Unsubscribe anytime.</p>

          {ref ? (
            <p className="text-xs text-muted-foreground">
              Referral applied: <span className="font-mono">{ref}</span>
            </p>
          ) : null}
        </form>
      </Card>

      <div className="rounded-lg border bg-background/60 p-4">
        <p className="text-sm font-medium">How it works</p>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4" aria-hidden />
            <span>Join the waitlist</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4" aria-hidden />
            <span>Get an invite when we open your area</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4" aria-hidden />
            <span>{finalHowItWorks}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
