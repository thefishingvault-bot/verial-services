'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertTriangle, CheckCircle, ExternalLink } from 'lucide-react';

interface ConnectDetails {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  stripeConnectId: string | null;
}

export default function PayoutsPage() {
  const [details, setDetails] = useState<ConnectDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetails = useCallback(() => {
    setIsLoading(true);
    fetch('/api/provider/connect/details')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch provider details.');
        return res.json();
      })
      .then((data) => {
        setDetails(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const handleOnboarding = async () => {
    setIsRedirecting(true);
    try {
      const res = await fetch('/api/provider/connect/create-link', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to create onboarding link.');

      const { url } = await res.json();
      window.location.href = url; // Redirect user to Stripe
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create onboarding link.';
      setError(message);
      setIsRedirecting(false);
    }
  };

  const renderStatusCard = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="ml-2 text-muted-foreground">Loading payout details...</p>
        </div>
      );
    }

    if (error) {
      return (
        <CardContent className="flex items-center text-destructive">
          <AlertTriangle className="h-6 w-6 mr-2" />
          <div>
            <p className="font-semibold">Error</p>
            <p>{error}</p>
          </div>
        </CardContent>
      );
    }

    if (!details) return null;

    // State 1: Not Onboarded
    if (!details.stripeConnectId || !details.detailsSubmitted) {
      return (
        <>
          <CardHeader>
            <CardTitle>Get Paid with Verial</CardTitle>
            <CardDescription>
              Verial partners with Stripe for secure financial services. Connect your account
              to receive payouts directly to your bank.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleOnboarding} disabled={isRedirecting} className="w-full">
              {isRedirecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
              Start Stripe Onboarding
            </Button>
            <p className="text-xs text-muted-foreground mt-4 text-center">
              You will be redirected to Stripe to complete a simple setup.
            </p>
          </CardContent>
        </>
      );
    }

    // State 2: Verification Pending
    if (details.detailsSubmitted && (!details.payoutsEnabled || !details.chargesEnabled)) {
      return (
        <>
          <CardHeader>
            <CardTitle className="flex items-center text-yellow-600">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Verification Pending
            </CardTitle>
            <CardDescription>
              Your Stripe account is under review, or you may need to submit
              more information. Payouts are not yet active.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleOnboarding} disabled={isRedirecting} className="w-full">
              {isRedirecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
              Manage Stripe Account
            </Button>
            <div className="text-sm text-muted-foreground mt-4 space-y-1">
              <p>Charges Enabled: {details.chargesEnabled ? 'Yes' : 'No'}</p>
              <p>Payouts Enabled: {details.payoutsEnabled ? 'Yes' : 'No'}</p>
            </div>
          </CardContent>
        </>
      );
    }

    // State 3: Fully Active
    return (
      <>
        <CardHeader>
          <CardTitle className="flex items-center text-green-600">
            <CheckCircle className="h-5 w-5 mr-2" />
            Payouts Active
          </CardTitle>
          <CardDescription>
            Your Stripe account is fully verified. You are ready to receive payouts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleOnboarding} variant="outline" disabled={isRedirecting} className="w-full">
            {isRedirecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
            Manage Stripe Account
          </Button>
          <div className="text-sm text-muted-foreground mt-4 space-y-1">
            <p>Charges Enabled: {details.chargesEnabled ? 'Yes' : 'No'}</p>
            <p>Payouts Enabled: {details.payoutsEnabled ? 'Yes' : 'No'}</p>
          </div>
        </CardContent>
      </>
    );
  };

  return (
    <div className="max-w-lg mx-auto p-4 md:p-8">
      <h1 className="text-2xl font-bold mb-4">Provider Payouts</h1>
      <Card>{renderStatusCard()}</Card>
    </div>
  );
}

