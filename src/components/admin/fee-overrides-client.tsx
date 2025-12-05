'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DollarSign, Percent, TrendingUp, TrendingDown, RefreshCw, Settings, Calculator } from 'lucide-react';

interface FeeOverride {
  providerId: string;
  providerName: string;
  businessName: string;
  providerEmail: string;
  trustLevel: string;
  serviceCategories: string[];
  totalBookings: number;
  totalRevenue: number;
  defaultPlatformFee: number;
  customFeeRate: number | null;
  effectiveFeeRate: number;
  hasCustomOverride: boolean;
  monthlySavings: number;
  status: string;
  createdAt: string;
  lastModified: string | null;
}

interface Stats {
  totalProviders: number;
  providersWithOverrides: number;
  providersOnDefault: number;
  totalRevenue: number;
  totalMonthlyFees: number;
  totalMonthlySavings: number;
  avgFeeRate: number;
}

export function FeeOverridesClient() {
  const [overrides, setOverrides] = useState<FeeOverride[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedProvider, setSelectedProvider] = useState<FeeOverride | null>(null);
  const [customFeeRate, setCustomFeeRate] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const fetchFeeOverrides = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
      });

      const response = await fetch(`/api/admin/fee-overrides?${params}`);
      if (!response.ok) throw new Error('Failed to fetch fee overrides');

      const data = await response.json();
      setOverrides(data.overrides);
      setStats(data.stats);
    } catch (error) {
      console.error('Error fetching fee overrides:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchFeeOverrides();
  }, [fetchFeeOverrides]);

  const handleSetOverride = async () => {
    if (!selectedProvider || !customFeeRate) return;

    try {
      const response = await fetch('/api/admin/fee-overrides', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          providerId: selectedProvider.providerId,
          customFeeRate: parseFloat(customFeeRate),
          reason: overrideReason,
        }),
      });

      if (!response.ok) throw new Error('Failed to set fee override');

      // Refresh the data
      await fetchFeeOverrides();
      setIsDialogOpen(false);
      setSelectedProvider(null);
      setCustomFeeRate('');
      setOverrideReason('');
    } catch (error) {
      console.error('Error setting fee override:', error);
    }
  };

  const openOverrideDialog = (provider: FeeOverride) => {
    setSelectedProvider(provider);
    setCustomFeeRate(provider.customFeeRate?.toString() || '');
    setOverrideReason('');
    setIsDialogOpen(true);
  };

  const getStatusBadge = (status: string, hasCustomOverride: boolean) => {
    if (hasCustomOverride) {
      return <Badge variant="default" className="bg-blue-100 text-blue-800"><Settings className="w-3 h-3 mr-1" />Custom</Badge>;
    }
    return <Badge variant="secondary">Default (15%)</Badge>;
  };

  const getTrustLevelBadge = (trustLevel: string) => {
    switch (trustLevel) {
      case 'platinum':
        return <Badge variant="default" className="bg-purple-100 text-purple-800">Platinum</Badge>;
      case 'gold':
        return <Badge variant="default" className="bg-yellow-100 text-yellow-800">Gold</Badge>;
      case 'silver':
        return <Badge variant="default" className="bg-gray-100 text-gray-800">Silver</Badge>;
      default:
        return <Badge variant="outline">Bronze</Badge>;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100); // Convert cents to dollars
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading fee overrides...</div>;
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
                  <SelectItem value="active">Custom Overrides</SelectItem>
                  <SelectItem value="default">Default Fees</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button onClick={fetchFeeOverrides} variant="outline">
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
                {stats.providersWithOverrides} with custom fees
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Platform Revenue</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatCurrency(stats.totalMonthlyFees)}</div>
              <p className="text-xs text-muted-foreground">
                Monthly fee collection
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Provider Savings</CardTitle>
              <TrendingDown className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{formatCurrency(stats.totalMonthlySavings)}</div>
              <p className="text-xs text-muted-foreground">
                From fee overrides
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Fee Rate</CardTitle>
              <Percent className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.avgFeeRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                Platform-wide average
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Fee Overrides Table */}
      <Card>
        <CardHeader>
          <CardTitle>Fee Policy Overrides</CardTitle>
          <CardDescription>
            Manage custom fee rates for providers. Default platform fee is 15%.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Trust Level</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Current Fee</TableHead>
                <TableHead>Monthly Savings</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overrides.map((override) => (
                <TableRow key={override.providerId}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{override.providerName}</div>
                      <div className="text-sm text-muted-foreground">{override.businessName}</div>
                      <div className="text-xs text-muted-foreground">{override.providerEmail}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getTrustLevelBadge(override.trustLevel)}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{formatCurrency(override.totalRevenue)}</div>
                    <div className="text-xs text-muted-foreground">
                      {override.totalBookings} bookings
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{override.effectiveFeeRate}%</div>
                    {override.hasCustomOverride && (
                      <div className="text-xs text-muted-foreground">
                        (was {override.defaultPlatformFee}%)
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {override.monthlySavings > 0 ? (
                      <div className="text-green-600 font-medium">
                        +{formatCurrency(override.monthlySavings)}
                      </div>
                    ) : (
                      <div className="text-muted-foreground">-</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(override.status, override.hasCustomOverride)}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openOverrideDialog(override)}
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Configure
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {overrides.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No providers found matching the current filters.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Override Configuration Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Configure Fee Override</DialogTitle>
            <DialogDescription>
              Set a custom fee rate for {selectedProvider?.providerName}.
              Default platform fee is 15%.
            </DialogDescription>
          </DialogHeader>

          {selectedProvider && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="current-fee">Current Fee Rate</Label>
                  <div className="text-2xl font-bold">{selectedProvider.effectiveFeeRate}%</div>
                </div>
                <div>
                  <Label htmlFor="monthly-revenue">Monthly Revenue</Label>
                  <div className="text-2xl font-bold">{formatCurrency(selectedProvider.totalRevenue)}</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="custom-fee">Custom Fee Rate (%)</Label>
                <Input
                  id="custom-fee"
                  type="number"
                  min="0"
                  max="50"
                  step="0.5"
                  value={customFeeRate}
                  onChange={(e) => setCustomFeeRate(e.target.value)}
                  placeholder="Enter fee rate (0-50%)"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">Reason for Override</Label>
                <Textarea
                  id="reason"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Explain why this provider deserves a custom fee rate..."
                  rows={3}
                />
              </div>

              {customFeeRate && (
                <Card className="bg-blue-50">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <Calculator className="w-4 h-4" />
                      <span className="text-sm font-medium">Fee Calculation Preview</span>
                    </div>
                    <div className="mt-2 space-y-1 text-sm">
                      <div>New fee rate: {customFeeRate}%</div>
                      <div>Monthly fees: {formatCurrency((selectedProvider.totalRevenue * parseFloat(customFeeRate)) / 100)}</div>
                      <div className="text-green-600">
                        Provider savings: {formatCurrency(selectedProvider.totalRevenue * (15 - parseFloat(customFeeRate)) / 100)}/month
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSetOverride} disabled={!customFeeRate}>
              Set Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}