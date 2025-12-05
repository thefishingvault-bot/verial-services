'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, AlertCircle } from 'lucide-react';
import { useUser } from '@clerk/nextjs';
import { useToast } from '@/components/ui/use-toast';

interface ProviderSettings {
  chargesGst: boolean;
  baseSuburb: string | null;
  baseRegion: string | null;
  serviceRadiusKm: number | null;
}

export default function ProviderSettingsPage() {
  const { user } = useUser();
  const isProvider = user?.publicMetadata?.role === 'provider';
  const { toast } = useToast();

  const [chargesGst, setChargesGst] = useState(true); // Default to true
  const [baseSuburb, setBaseSuburb] = useState('');
  const [baseRegion, setBaseRegion] = useState('');
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

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        chargesGst,
        baseSuburb: baseSuburb.trim() || null,
        baseRegion: baseRegion.trim() || null,
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
                <Label htmlFor="base-suburb">Base suburb</Label>
                <input
                  id="base-suburb"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="e.g. Manukau, New Lynn"
                  value={baseSuburb}
                  onChange={(e) => setBaseSuburb(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="base-region">Region</Label>
                <select
                  id="base-region"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={baseRegion}
                  onChange={(e) => setBaseRegion(e.target.value)}
                >
                  <option value="">Select a region</option>
                  <option value="Auckland">Auckland</option>
                  <option value="Waikato">Waikato</option>
                  <option value="Bay of Plenty">Bay of Plenty</option>
                  <option value="Wellington">Wellington</option>
                  <option value="Canterbury">Canterbury</option>
                  <option value="Otago">Otago</option>
                  <option value="Other / NZ-wide">Other / NZ-wide</option>
                </select>
              </div>

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

