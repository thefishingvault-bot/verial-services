
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function CustomerSettingsPage() {
  return (
    <div className="mx-auto max-w-lg p-4 md:p-8">
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>Customer account preferences.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Customer settings are currently managed from your profile.
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link href="/dashboard/profile">Go to Profile</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
