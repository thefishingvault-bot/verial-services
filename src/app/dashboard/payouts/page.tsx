'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, AlertTriangle, CheckCircle, ExternalLink, DollarSign, Clock } from 'lucide-react';
import { formatPrice } from '@/lib/utils';

interface ConnectDetails {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  stripeConnectId: string | null;
}

interface Payout {
  id: string;
  amount: number;
  currency: string;
  status: string;
  arrivalDate: number;
  created: number;
  description: string | null;
  method: string;
}

interface PayoutsSummary {
  availableBalance: number;
  pendingBalance: number;
  currency: string;
  payouts: Payout[];
}

export default function PayoutsPage() {
  const [details, setDetails] = useState<ConnectDetails | null>(null);
  const [summary, setSummary] = useState<PayoutsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPayoutsSummary = useCallback(() => {
    setIsLoadingSummary(true);
    fetch('/api/provider/payouts/summary')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch payouts summary.');
        return res.json();
      })
      .then((data) => {
        setSummary(data);
        setIsLoadingSummary(false);
      })
      .catch((err) => {
        console.error('Error fetching payouts summary:', err);
        setIsLoadingSummary(false);
      });
  }, []);

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
        
        // If fully active, fetch payout summary
        if (data.chargesEnabled && data.payoutsEnabled && data.stripeConnectId) {
          fetchPayoutsSummary();
        }
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [fetchPayoutsSummary]);

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
        </CardContent>
      </>
    );
  };

  const renderBalanceCards = () => {
    if (!summary || isLoadingSummary) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center text-muted-foreground">
              <DollarSign className="h-4 w-4 mr-2" />
              Available Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPrice(summary.availableBalance)}</div>
            <p className="text-xs text-muted-foreground mt-1">Ready to payout</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center text-muted-foreground">
              <Clock className="h-4 w-4 mr-2" />
              Pending Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPrice(summary.pendingBalance)}</div>
            <p className="text-xs text-muted-foreground mt-1">Processing</p>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderPayoutsTable = () => {
    if (!summary || isLoadingSummary) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Recent Payouts</CardTitle>
            <CardDescription>Your recent payout history</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      );
    }

    if (summary.payouts.length === 0) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Recent Payouts</CardTitle>
            <CardDescription>Your recent payout history</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center py-8">
              No payouts yet. Payouts will appear here once you receive payments.
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Payouts</CardTitle>
          <CardDescription>Your recent payout history</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Arrival</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.payouts.map((payout) => (
                <TableRow key={payout.id}>
                  <TableCell>
                    {new Date(payout.created * 1000).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatPrice(payout.amount)}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      payout.status === 'paid' 
                        ? 'bg-green-100 text-green-800' 
                        : payout.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(payout.arrivalDate * 1000).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  };

  const isFullyActive = details && details.chargesEnabled && details.payoutsEnabled && details.detailsSubmitted;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <h1 className="text-2xl font-bold mb-6">Provider Payouts</h1>
      
      <Card className="mb-6">{renderStatusCard()}</Card>
      
      {isFullyActive && (
        <>
          {renderBalanceCards()}
          {renderPayoutsTable()}
        </>
      )}
    </div>
  );
}

