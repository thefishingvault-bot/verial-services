'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, ExternalLink, DollarSign, Building } from 'lucide-react';
import { formatPrice } from '@/lib/utils';

// Types
interface ConnectDetails {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  stripeConnectId: string | null;
}

interface FinancialSummary {
  available: number;
  pending: number;
  currency: string;
  payouts: {
    id: string;
    amount: number;
    status: string;
    arrivalDate: number;
  }[];
}

export default function PayoutsPage() {
  const [details, setDetails] = useState<ConnectDetails | null>(null);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Check Onboarding Status
      const detailsRes = await fetch('/api/provider/connect/details');
      if (!detailsRes.ok) throw new Error('Failed to fetch provider details.');
      const detailsData = await detailsRes.json();
      setDetails(detailsData);

      // 2. If fully active, fetch Financial Summary
      if (detailsData.stripeConnectId && detailsData.payoutsEnabled) {
        const summaryRes = await fetch('/api/provider/payouts/summary');
        if (summaryRes.ok) {
          const summaryData = await summaryRes.json();
          setSummary(summaryData);
        }
      }
    } catch (err) {
      setError((err as Error).message ?? 'Failed to load financial data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOnboarding = async () => {
    setIsRedirecting(true);
    try {
      const res = await fetch('/api/provider/connect/create-link', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to create onboarding link.');
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      setError((err as Error).message ?? 'Failed to create onboarding link.');
      setIsRedirecting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="ml-2 text-muted-foreground">Loading financial data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-destructive flex items-center">
        <AlertTriangle className="mr-2 h-5 w-5" /> {error}
      </div>
    );
  }

  // --- State 1: Not Onboarded or Pending ---
  if (!details?.payoutsEnabled) {
    return (
      <div className="max-w-lg mx-auto p-4 md:p-8">
         <Card>
          <CardHeader>
            <CardTitle>Get Paid with Verial</CardTitle>
            <CardDescription>
              {!details?.detailsSubmitted 
                ? 'Connect your bank account to receive payouts.' 
                : 'Your account is under review. Please check back soon.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleOnboarding} disabled={isRedirecting} className="w-full">
              {isRedirecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
              {details?.detailsSubmitted ? 'Check Status in Stripe' : 'Start Stripe Onboarding'}
            </Button>
          </CardContent>
         </Card>
      </div>
    );
  }

  // --- State 2: Active Dashboard ---
  return (
    <div className="container max-w-5xl mx-auto p-4 md:p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Financial Dashboard</h1>
        <Button variant="outline" onClick={handleOnboarding} disabled={isRedirecting}>
          {isRedirecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Building className="mr-2 h-4 w-4" />}
          Stripe Settings
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {summary ? formatPrice(summary.available) : '$0.00'}
            </div>
            <p className="text-xs text-muted-foreground">Ready to be paid out</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Balance</CardTitle>
            <Loader2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">
              {summary ? formatPrice(summary.pending) : '$0.00'}
            </div>
            <p className="text-xs text-muted-foreground">Future payouts (rolling basis)</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Payouts</CardTitle>
          <CardDescription>Transfers sent to your bank account.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!summary?.payouts || summary.payouts.length === 0) ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">No payouts yet.</TableCell>
                </TableRow>
              ) : (
                summary.payouts.map((payout) => (
                  <TableRow key={payout.id}>
                    <TableCell>{new Date(payout.arrivalDate * 1000).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant={payout.status === 'paid' ? 'default' : 'secondary'} className="capitalize">
                        {payout.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatPrice(payout.amount)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

