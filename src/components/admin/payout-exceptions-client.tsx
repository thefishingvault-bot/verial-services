'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, DollarSign, Clock, CheckCircle, RefreshCw, UserX, CreditCard, Zap } from 'lucide-react';

interface PayoutException {
  providerId: string;
  providerName: string;
  providerEmail: string;
  businessName: string;
  stripeConnectId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  isSuspended: boolean;
  trustLevel: string;
  totalBookings: number;
  completedBookings: number;
  totalRevenue: number;
  pendingRefunds: number;
  failedRefunds: number;
  createdAt: string;
  exceptions: string[];
  isException: boolean;
  needsReview: boolean;
  isHighValue: boolean;
  payoutStatus: string;
}

interface Stats {
  totalProviders: number;
  providersWithExceptions: number;
  providersReadyForPayout: number;
  providersWithPayoutsDisabled: number;
  providersNotConnected: number;
  suspendedProviders: number;
  highValueProviders: number;
  totalPendingRefunds: number;
  totalFailedRefunds: number;
  totalRevenue: number;
}

export function PayoutExceptionsClient() {
  const [providers, setProviders] = useState<PayoutException[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [timeframeFilter, setTimeframeFilter] = useState('30d');

  const fetchPayoutExceptions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        timeframe: timeframeFilter,
      });

      const response = await fetch(`/api/admin/payout-exceptions?${params}`);
      if (!response.ok) throw new Error('Failed to fetch payout exceptions');

      const data = await response.json();
      setProviders(data.providers);
      setStats(data.stats);
    } catch (error) {
      console.error('Error fetching payout exceptions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayoutExceptions();
  }, [statusFilter, timeframeFilter]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'enabled':
        return <Badge variant="default" className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Enabled</Badge>;
      case 'disabled':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Disabled</Badge>;
      case 'not_connected':
        return <Badge variant="destructive"><CreditCard className="w-3 h-3 mr-1" />Not Connected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getExceptionBadges = (exceptions: string[]) => {
    return exceptions.map(exception => {
      switch (exception) {
        case 'no_stripe_connect':
          return <Badge key={exception} variant="destructive" className="mr-1">No Stripe</Badge>;
        case 'payouts_disabled':
          return <Badge key={exception} variant="secondary" className="mr-1">Payouts Off</Badge>;
        case 'provider_suspended':
          return <Badge key={exception} variant="destructive" className="mr-1"><UserX className="w-3 h-3 mr-1" />Suspended</Badge>;
        case 'pending_refunds':
          return <Badge key={exception} variant="secondary" className="mr-1"><Clock className="w-3 h-3 mr-1" />Pending Refunds</Badge>;
        case 'failed_refunds':
          return <Badge key={exception} variant="destructive" className="mr-1"><AlertTriangle className="w-3 h-3 mr-1" />Failed Refunds</Badge>;
        case 'ready_for_payout':
          return <Badge key={exception} variant="default" className="mr-1"><Zap className="w-3 h-3 mr-1" />Ready</Badge>;
        default:
          return <Badge key={exception} variant="outline" className="mr-1">{exception}</Badge>;
      }
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100); // Convert cents to dollars
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading payout exceptions...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Providers</SelectItem>
                  <SelectItem value="exceptions">Has Exceptions</SelectItem>
                  <SelectItem value="ready">Ready for Payout</SelectItem>
                  <SelectItem value="disabled">Payouts Disabled</SelectItem>
                  <SelectItem value="not_connected">Not Connected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Timeframe</label>
              <Select value={timeframeFilter} onValueChange={setTimeframeFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button onClick={fetchPayoutExceptions} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Providers</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalProviders}</div>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(stats.totalRevenue)} total revenue
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Exceptions</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.providersWithExceptions}</div>
              <p className="text-xs text-muted-foreground">
                Need attention
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ready for Payout</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.providersReadyForPayout}</div>
              <p className="text-xs text-muted-foreground">
                Can process payouts
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed Refunds</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats.totalFailedRefunds}</div>
              <p className="text-xs text-muted-foreground">
                {stats.totalPendingRefunds} pending
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Providers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Provider Payout Status</CardTitle>
          <CardDescription>
            Review provider payout configurations and identify exceptions requiring attention
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Payout Status</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Bookings</TableHead>
                <TableHead>Exceptions</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((provider) => (
                <TableRow key={provider.providerId}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{provider.providerName}</div>
                      <div className="text-sm text-muted-foreground">{provider.businessName}</div>
                      <div className="text-xs text-muted-foreground">{provider.providerEmail}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(provider.payoutStatus)}
                    {provider.isSuspended && (
                      <div className="text-xs text-red-600 mt-1">
                        Account Suspended
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{formatCurrency(provider.totalRevenue)}</div>
                    {provider.isHighValue && (
                      <Badge variant="outline" className="text-xs">High Value</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {provider.totalBookings} total
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {provider.completedBookings} completed
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {getExceptionBadges(provider.exceptions)}
                    </div>
                    {(provider.pendingRefunds > 0 || provider.failedRefunds > 0) && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {provider.pendingRefunds} pending, {provider.failedRefunds} failed refunds
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {provider.needsReview && (
                        <Button size="sm" variant="outline">
                          Review
                        </Button>
                      )}
                      <Button size="sm" variant="outline">
                        Details
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {providers.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No providers found matching the current filters.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}