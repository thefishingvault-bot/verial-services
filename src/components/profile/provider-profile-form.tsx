"use client";

import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { AvatarUploader } from "@/components/forms/avatar-uploader";
import { NZ_REGIONS, NZ_REGIONS_TO_SUBURBS } from "@/lib/data/nz-suburbs";
import { getTrustBadge } from "@/lib/utils";

type ProviderProfileResponse = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  provider?: {
    bio: string | null;
    businessName: string | null;
    handle: string | null;
    trustLevel: "bronze" | "silver" | "gold" | "platinum";
    trustScore: number;
  } | null;
};

type ProviderSettingsResponse = {
  chargesGst: boolean;
  baseSuburb: string | null;
  baseRegion: string | null;
  serviceRadiusKm: number | null;
  coverageRegion?: string | null;
  coverageSuburbs?: string[];
  gstNumber?: string | null;
};

export function ProviderProfileForm() {
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProviderProfileResponse | null>(null);

  const [businessName, setBusinessName] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [chargesGst, setChargesGst] = useState(true);
  const [gstNumber, setGstNumber] = useState("");
  const [baseSuburb, setBaseSuburb] = useState("");
  const [baseRegion, setBaseRegion] = useState("");
  const [coverageRegion, setCoverageRegion] = useState("");
  const [coverageSuburbs, setCoverageSuburbs] = useState<string[]>([]);
  const [serviceRadiusKm, setServiceRadiusKm] = useState(10);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setIsLoading(true);
        setError(null);

        const [profileRes, settingsRes] = await Promise.all([
          fetch("/api/profile/get"),
          fetch("/api/provider/settings"),
        ]);

        if (!profileRes.ok) {
          throw new Error(await profileRes.text());
        }
        if (!settingsRes.ok) {
          throw new Error(await settingsRes.text());
        }

        const profileData = (await profileRes.json()) as ProviderProfileResponse;
        const settingsData = (await settingsRes.json()) as ProviderSettingsResponse;

        if (cancelled) return;

        setProfile(profileData);

        setBusinessName(profileData.provider?.businessName ?? "");
        setHandle(profileData.provider?.handle ?? "");
        setBio(profileData.provider?.bio ?? "");
        setAvatarUrl(profileData.avatarUrl);

        setChargesGst(settingsData.chargesGst);
        setGstNumber(settingsData.gstNumber ?? "");
        setBaseSuburb(settingsData.baseSuburb ?? "");
        setBaseRegion(settingsData.baseRegion ?? "");
        setCoverageRegion(settingsData.coverageRegion ?? settingsData.baseRegion ?? "");
        setCoverageSuburbs(settingsData.coverageSuburbs ?? []);
        setServiceRadiusKm(settingsData.serviceRadiusKm ?? 10);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load profile.";
        if (!cancelled) {
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!baseSuburb && coverageSuburbs.length > 0) {
      setBaseSuburb(coverageSuburbs[0]);
    }
  }, [coverageSuburbs, baseSuburb]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const profilePayload = {
        firstName: profile?.firstName ?? undefined,
        lastName: profile?.lastName ?? undefined,
        bio,
        businessName: businessName.trim() || undefined,
        handle: handle.trim() || undefined,
        avatarUrl: avatarUrl ?? undefined,
      };

      const settingsPayload = {
        chargesGst,
        baseSuburb: baseSuburb.trim() || null,
        baseRegion: (coverageRegion || baseRegion).trim() || null,
        coverageSuburbs,
        serviceRadiusKm,
        gstNumber: gstNumber.trim() || null,
      };

      const [profileRes, settingsRes] = await Promise.all([
        fetch("/api/profile/update", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profilePayload),
        }),
        fetch("/api/provider/settings/update", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settingsPayload),
        }),
      ]);

      if (!profileRes.ok) {
        throw new Error(await profileRes.text());
      }
      if (!settingsRes.ok) {
        throw new Error(await settingsRes.text());
      }

      toast({ title: "Profile updated" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save profile.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const trustLevel = profile?.provider?.trustLevel ?? "bronze";
  const trustScore = profile?.provider?.trustScore ?? 0;
  const { Icon, color } = getTrustBadge(trustLevel);

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-4 md:p-8">
        <div className="flex items-center justify-center">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading profile...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Provider profile</h1>
        <p className="text-sm text-muted-foreground">
          Update your public profile, business details, and service area.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive rounded-lg flex items-start gap-2 text-sm">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
          <p className="text-destructive">{error}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Public profile</CardTitle>
          <CardDescription>
            This information is shown on your listings and booking pages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Avatar className="h-16 w-16">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={businessName || "Provider"} />}
              <AvatarFallback>{businessName?.charAt(0).toUpperCase() || "P"}</AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Profile photo</Label>
              <AvatarUploader onUploadComplete={setAvatarUrl} />
              <p className="text-xs text-muted-foreground">
                Use a clear photo or logo. Max 2MB.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="business-name">Business name</Label>
              <Input
                id="business-name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Jane's Plumbing"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="handle">Username (handle)</Label>
              <Input
                id="handle"
                value={handle}
                onChange={(e) => {
                  const formatted = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                  setHandle(formatted);
                }}
                placeholder="e.g. janes-plumbing"
              />
              <p className="text-xs text-muted-foreground">
                Your public URL will be /p/{handle || "..."}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">About your business</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell customers what you specialise in and what makes you different."
              rows={4}
            />
          </div>

          <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <div className={`flex h-9 w-9 items-center justify-center rounded-full bg-white ${color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="space-y-0.5">
              <p className="font-medium">Trust badge: {trustLevel.toUpperCase()}</p>
              <p className="text-xs text-muted-foreground">
                Your current trust score is {trustScore}. Higher scores unlock higher badge levels.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Business & service area</CardTitle>
          <CardDescription>GST settings and where you operate.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <div className="space-y-0.5">
              <Label htmlFor="gst-toggle">Prices include GST</Label>
              <p className="text-sm text-muted-foreground">
                Enable this if your service prices include 15% GST.
              </p>
            </div>
            <Switch id="gst-toggle" checked={chargesGst} onCheckedChange={setChargesGst} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="gst-number">GST number</Label>
              <Input
                id="gst-number"
                value={gstNumber}
                onChange={(e) => setGstNumber(e.target.value)}
                placeholder="Optional, shown on invoices when GST is enabled"
              />
            </div>
          </div>

          <div className="space-y-3 p-4 border rounded-lg">
            <div>
              <p className="text-sm font-medium">Service area</p>
              <p className="text-xs text-muted-foreground">
                Tell customers where you&apos;re based and how far you&apos;ll travel.
              </p>
            </div>

            <div className="space-y-2">
              <div className="space-y-1">
                <Label htmlFor="coverage-region">Region</Label>
                <select
                  id="coverage-region"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={coverageRegion}
                  onChange={(e) => {
                    setCoverageRegion(e.target.value);
                    setCoverageSuburbs([]);
                  }}
                >
                  <option value="">Select a region</option>
                  {NZ_REGIONS.map((region) => (
                    <option key={region} value={region}>
                      {region}
                    </option>
                  ))}
                </select>
              </div>

              {coverageRegion && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Suburbs</Label>
                    <button
                      type="button"
                      className="text-xs text-blue-600 hover:underline"
                      onClick={() => setCoverageSuburbs(NZ_REGIONS_TO_SUBURBS[coverageRegion] ?? [])}
                    >
                      Select all
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto rounded-md border px-3 py-2 space-y-1">
                    {(NZ_REGIONS_TO_SUBURBS[coverageRegion] || []).map((suburb) => {
                      const checked = coverageSuburbs.includes(suburb);
                      return (
                        <button
                          key={suburb}
                          type="button"
                          onClick={() => {
                            setCoverageSuburbs((prev) =>
                              checked ? prev.filter((s) => s !== suburb) : [...prev, suburb],
                            );
                            setBaseSuburb((prev) => prev || suburb);
                            setBaseRegion(coverageRegion);
                          }}
                          className="w-full flex items-center space-x-2 rounded px-2 py-1 text-left hover:bg-muted"
                        >
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded border bg-background">
                            {checked ? "✓" : ""}
                          </span>
                          <span className="text-sm">{suburb}</span>
                        </button>
                      );
                    })}
                    {(NZ_REGIONS_TO_SUBURBS[coverageRegion] || []).length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Suburb list coming soon for {coverageRegion}.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="service-radius">Service radius (km)</Label>
                <Input
                  id="service-radius"
                  type="number"
                  min={5}
                  max={50}
                  step={5}
                  value={serviceRadiusKm}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (!Number.isNaN(value)) {
                      setServiceRadiusKm(Math.min(50, Math.max(5, value)));
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Shown as "Travels up to {serviceRadiusKm} km from {baseSuburb || baseRegion || "your area"}" on
                  your listings.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="min-w-[140px]">
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}
