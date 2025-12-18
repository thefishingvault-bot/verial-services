'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, AlertCircle, CheckSquare, Square } from 'lucide-react';
import { useUser } from '@clerk/nextjs';
import { useToast } from '@/components/ui/use-toast';
import { NZ_REGIONS, NZ_REGIONS_TO_SUBURBS } from '@/lib/data/nz-regions.generated';

interface ProviderSettings {
  chargesGst: boolean;
  baseSuburb: string | null;
  baseRegion: string | null;
  serviceRadiusKm: number | null;
  coverageRegion?: string | null;
  coverageSuburbs?: string[];
}

export default function ProviderSettingsPage() {
  const { user } = useUser();
  const isProvider = user?.publicMetadata?.role === 'provider';
  const { toast } = useToast();

  const [chargesGst, setChargesGst] = useState(true); // Default to true
  const [baseSuburb, setBaseSuburb] = useState('');
  const [baseRegion, setBaseRegion] = useState('');
  const [coverageRegion, setCoverageRegion] = useState('');
  const [coverageSuburbs, setCoverageSuburbs] = useState<string[]>([]);
  const [serviceRadiusKm, setServiceRadiusKm] = useState(10);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isProvider) {
      // Fetch current provider settings
      fetch('/api/provider/settings')
        .then((res) => {
          if (!res.ok) throw new Error('Failed to fetch settings.');
          return res.json();
        })
        .then((data: ProviderSettings) => {
          setChargesGst(data.chargesGst);
          setBaseSuburb(data.baseSuburb ?? '');
          setBaseRegion(data.baseRegion ?? '');
          setCoverageRegion(data.coverageRegion ?? data.baseRegion ?? '');
          setCoverageSuburbs(data.coverageSuburbs ?? []);
          setServiceRadiusKm(data.serviceRadiusKm ?? 10);
          setIsLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, [isProvider]);

  useEffect(() => {
    if (!baseSuburb && coverageSuburbs.length > 0) {
      setBaseSuburb(coverageSuburbs[0]);
    }
  }, [coverageSuburbs, baseSuburb]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        chargesGst,
        baseSuburb: baseSuburb.trim() || null,
        baseRegion: (coverageRegion || baseRegion).trim() || null,
        coverageSuburbs,
        serviceRadiusKm,
      };

      const res = await fetch('/api/provider/settings/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await res.text());

      toast({ title: 'Settings saved successfully!' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save settings.';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto p-4 md:p-8">
        <div className="flex items-center justify-center">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading settings...
        </div>
      </div>
    );
  }

  if (!isProvider) {
    return (
      <div className="max-w-lg mx-auto p-4 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Your customer settings will be available here.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-4 md:p-8">
      <Card>
        <CardHeader>
          <CardTitle>Provider Settings</CardTitle>
          <CardDescription>
            Manage your public profile and financial settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between space-x-2 p-4 border rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor="gst-toggle">Prices Include GST</Label>
              <p className="text-sm text-muted-foreground">
                Enable this if your service prices include 15% GST.
              </p>
            </div>
            <Switch
              id="gst-toggle"
              checked={chargesGst}
              onCheckedChange={setChargesGst}
            />
          </div>

          <div className="p-4 bg-muted rounded-lg">
            <div className="flex items-start space-x-2">
              <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Important Note</p>
                <p className="text-sm text-muted-foreground">
                  This setting only affects <strong>new services</strong> you create.
                  Existing services will keep their original GST status to maintain pricing consistency.
                </p>
              </div>
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
                <Label htmlFor="base-region">Region</Label>
                <select
                  id="base-region"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={coverageRegion}
                  onChange={(e) => {
                    setCoverageRegion(e.target.value);
                    setCoverageSuburbs([]);
                  }}
                >
                  <option value="">Select a region</option>
                  {NZ_REGIONS.map((region) => (
                    <option key={region} value={region}>{region}</option>
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
                            setCoverageSuburbs((prev) => checked ? prev.filter((s) => s !== suburb) : [...prev, suburb]);
                            setBaseSuburb((prev) => prev || suburb);
                            setBaseRegion(coverageRegion);
                          }}
                          className="w-full flex items-center space-x-2 rounded px-2 py-1 text-left hover:bg-muted"
                        >
                          {checked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                          <span className="text-sm">{suburb}</span>
                        </button>
                      );
                    })}
                    {(NZ_REGIONS_TO_SUBURBS[coverageRegion] || []).length === 0 && (
                      <p className="text-xs text-muted-foreground">Suburb list coming soon for {coverageRegion}.</p>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="service-radius">Service radius (km)</Label>
                <input
                  id="service-radius"
                  type="number"
                  min={5}
                  max={50}
                  step={5}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={serviceRadiusKm}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (!Number.isNaN(value)) {
                      setServiceRadiusKm(Math.min(50, Math.max(5, value)));
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Shown on your listings as &quot;Travels up to {serviceRadiusKm} km from {baseSuburb || baseRegion || 'your area'}&quot;.
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive rounded-lg">
              <p className="text-sm font-medium text-destructive">{error}</p>
            </div>
          )}

          <Button onClick={handleSave} disabled={isSaving} className="w-full">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save Settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

