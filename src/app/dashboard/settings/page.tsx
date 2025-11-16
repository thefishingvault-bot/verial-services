'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, AlertCircle } from 'lucide-react';
import { useUser } from '@clerk/nextjs';

interface ProviderSettings {
  chargesGst: boolean;
}

export default function ProviderSettingsPage() {
  const { user } = useUser();
  const isProvider = user?.publicMetadata?.role === 'provider';

  const [chargesGst, setChargesGst] = useState(true); // Default to true
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
      const res = await fetch('/api/provider/settings/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chargesGst }),
      });

      if (!res.ok) throw new Error(await res.text());

      alert('Settings saved successfully!');

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

