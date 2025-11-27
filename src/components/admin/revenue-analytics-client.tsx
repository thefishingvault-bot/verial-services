'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DollarSign, TrendingUp, TrendingDown, Users, Building, Calendar, RefreshCw, BarChart3, PieChart, MapPin } from 'lucide-react';

interface OverallStats {
  totalRevenue: number;
  totalBookings: number;
  avgBookingValue: number;
  totalPlatformFees: number;
  totalRefunds: number;
  netRevenue: number;
  uniqueCustomers: number;
  uniqueProviders: number;
  revenueGrowth: number;
  bookingGrowth: number;
}

interface RevenueTrend {
  period: string;
  totalRevenue: number;
  bookingCount: number;
  avgBookingValue: number;
  platformFees: number;
  refunds: number;
  netRevenue: number;
}

interface CategoryRevenue {
  category: string;
  totalRevenue: number;
  bookingCount: number;
  avgBookingValue: number;
  platformFees: number;
}

interface ProviderRevenue {
  providerId: string;
  providerName: string;
  businessName: string;
  trustLevel: string;
  totalRevenue: number;
  bookingCount: number;
  avgBookingValue: number;
  platformFees: number;
  refunds: number;
  netRevenue: number;
}

interface RegionRevenue {
  region: string;
  totalRevenue: number;
  bookingCount: number;
  providerCount: number;
  avgBookingValue: number;
}

export function RevenueAnalyticsClient() {
  const [timeframe, setTimeframe] = useState('30d');
  const [groupBy, setGroupBy] = useState('day');
  const [loading, setLoading] = useState(true);
  const [overallStats, setOverallStats] = useState<OverallStats | null>(null);
  const [revenueTrends, setRevenueTrends] = useState<RevenueTrend[]>([]);
  const [revenueByCategory, setRevenueByCategory] = useState<CategoryRevenue[]>([]);
  const [revenueByProvider, setRevenueByProvider] = useState<ProviderRevenue[]>([]);
  const [revenueByRegion, setRevenueByRegion] = useState<RegionRevenue[]>([]);

  const fetchRevenueAnalytics = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        timeframe,
        groupBy,
      });

      const response = await fetch(`/api/admin/revenue-analytics?${params}`);
      if (!response.ok) throw new Error('Failed to fetch revenue analytics');

      const data = await response.json();
      setOverallStats(data.overallStats);
      setRevenueTrends(data.revenueTrends);
      setRevenueByCategory(data.revenueByCategory);
      setRevenueByProvider(data.revenueByProvider);
      setRevenueByRegion(data.revenueByRegion);
    } catch (error) {
      console.error('Error fetching revenue analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRevenueAnalytics();
  }, [timeframe, groupBy]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100); // Convert cents to dollars
  };

  const formatPercentage = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  const getGrowthBadge = (growth: number) => {
    if (growth > 0) {
      return <Badge variant="default" className="bg-green-100 text-green-800"><TrendingUp className="w-3 h-3 mr-1" />{formatPercentage(growth)}</Badge>;
    } else if (growth < 0) {
      return <Badge variant="destructive"><TrendingDown className="w-3 h-3 mr-1" />{formatPercentage(growth)}</Badge>;
    }
    return <Badge variant="secondary">0.0%</Badge>;
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

  // Simple bar chart representation using CSS
  const renderBarChart = (data: RevenueTrend[], valueKey: keyof RevenueTrend) => {
    const maxValue = Math.max(...data.map(d => Number(d[valueKey])));
    return (
      <div className="space-y-2">
        {data.slice(-10).map((item, index) => {
          const value = Number(item[valueKey]);
          const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
          return (
            <div key={index} className="flex items-center gap-2">
              <div className="w-16 text-xs text-muted-foreground truncate">
                {new Date(item.period).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              <div className="flex-1 bg-gray-200 rounded h-4">
                <div
                  className="bg-blue-500 h-4 rounded transition-all duration-300"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <div className="w-16 text-xs text-right">
                {formatCurrency(value)}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading revenue analytics...</div>;
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
              <label className="text-sm font-medium">Timeframe</label>
              <Select value={timeframe} onValueChange={setTimeframe}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                  <SelectItem value="1y">Last year</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Group By</label>
              <Select value={groupBy} onValueChange={setGroupBy}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Daily</SelectItem>
                  <SelectItem value="week">Weekly</SelectItem>
                  <SelectItem value="month">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button onClick={fetchRevenueAnalytics} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      {overallStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(overallStats.totalRevenue)}</div>
              <div className="flex items-center gap-2 mt-1">
                {getGrowthBadge(overallStats.revenueGrowth)}
                <span className="text-xs text-muted-foreground">vs previous period</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Net Platform Fees</CardTitle>
              <BarChart3 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatCurrency(overallStats.netRevenue)}</div>
              <p className="text-xs text-muted-foreground">
                After refunds: {formatCurrency(overallStats.totalRefunds)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overallStats.totalBookings.toLocaleString()}</div>
              <div className="flex items-center gap-2 mt-1">
                {getGrowthBadge(overallStats.bookingGrowth)}
                <span className="text-xs text-muted-foreground">vs previous period</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overallStats.uniqueCustomers.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {overallStats.uniqueProviders} providers
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Analytics Tabs */}
      <Tabs defaultValue="trends" className="space-y-4">
        <TabsList>
          <TabsTrigger value="trends">Revenue Trends</TabsTrigger>
          <TabsTrigger value="categories">By Category</TabsTrigger>
          <TabsTrigger value="providers">Top Providers</TabsTrigger>
          <TabsTrigger value="regions">By Region</TabsTrigger>
        </TabsList>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Trends</CardTitle>
              <CardDescription>
                Daily revenue and booking patterns over the selected timeframe
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <h4 className="text-sm font-medium mb-2">Revenue Over Time</h4>
                {renderBarChart(revenueTrends, 'totalRevenue')}
              </div>
              <div className="mb-4">
                <h4 className="text-sm font-medium mb-2">Platform Fees Over Time</h4>
                {renderBarChart(revenueTrends, 'platformFees')}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detailed Trends Table</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Bookings</TableHead>
                    <TableHead>Avg Value</TableHead>
                    <TableHead>Platform Fees</TableHead>
                    <TableHead>Refunds</TableHead>
                    <TableHead>Net Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revenueTrends.slice(-10).map((trend) => (
                    <TableRow key={trend.period}>
                      <TableCell>{new Date(trend.period).toLocaleDateString()}</TableCell>
                      <TableCell>{formatCurrency(trend.totalRevenue)}</TableCell>
                      <TableCell>{trend.bookingCount}</TableCell>
                      <TableCell>{formatCurrency(trend.avgBookingValue)}</TableCell>
                      <TableCell>{formatCurrency(trend.platformFees)}</TableCell>
                      <TableCell>{formatCurrency(trend.refunds)}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(trend.netRevenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue by Service Category</CardTitle>
              <CardDescription>
                Performance breakdown by service type
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Total Revenue</TableHead>
                    <TableHead>Bookings</TableHead>
                    <TableHead>Avg Value</TableHead>
                    <TableHead>Platform Fees</TableHead>
                    <TableHead>% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revenueByCategory.map((category) => {
                    const percentage = overallStats ? (category.totalRevenue / overallStats.totalRevenue) * 100 : 0;
                    return (
                      <TableRow key={category.category}>
                        <TableCell className="font-medium capitalize">{category.category.replace('_', ' ')}</TableCell>
                        <TableCell>{formatCurrency(category.totalRevenue)}</TableCell>
                        <TableCell>{category.bookingCount}</TableCell>
                        <TableCell>{formatCurrency(category.avgBookingValue)}</TableCell>
                        <TableCell>{formatCurrency(category.platformFees)}</TableCell>
                        <TableCell>{percentage.toFixed(1)}%</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="providers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Performing Providers</CardTitle>
              <CardDescription>
                Revenue leaders and their performance metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Trust Level</TableHead>
                    <TableHead>Total Revenue</TableHead>
                    <TableHead>Bookings</TableHead>
                    <TableHead>Avg Value</TableHead>
                    <TableHead>Platform Fees</TableHead>
                    <TableHead>Net Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revenueByProvider.map((provider) => (
                    <TableRow key={provider.providerId}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{provider.providerName}</div>
                          <div className="text-sm text-muted-foreground">{provider.businessName}</div>
                        </div>
                      </TableCell>
                      <TableCell>{getTrustLevelBadge(provider.trustLevel)}</TableCell>
                      <TableCell>{formatCurrency(provider.totalRevenue)}</TableCell>
                      <TableCell>{provider.bookingCount}</TableCell>
                      <TableCell>{formatCurrency(provider.avgBookingValue)}</TableCell>
                      <TableCell>{formatCurrency(provider.platformFees)}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(provider.netRevenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="regions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue by Region</CardTitle>
              <CardDescription>
                Geographic distribution of platform revenue
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Region</TableHead>
                    <TableHead>Total Revenue</TableHead>
                    <TableHead>Bookings</TableHead>
                    <TableHead>Providers</TableHead>
                    <TableHead>Avg Value</TableHead>
                    <TableHead>% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revenueByRegion.map((region) => {
                    const percentage = overallStats ? (region.totalRevenue / overallStats.totalRevenue) * 100 : 0;
                    return (
                      <TableRow key={region.region}>
                        <TableCell className="font-medium">
                          <MapPin className="w-4 h-4 inline mr-2" />
                          {region.region}
                        </TableCell>
                        <TableCell>{formatCurrency(region.totalRevenue)}</TableCell>
                        <TableCell>{region.bookingCount}</TableCell>
                        <TableCell>{region.providerCount}</TableCell>
                        <TableCell>{formatCurrency(region.avgBookingValue)}</TableCell>
                        <TableCell>{percentage.toFixed(1)}%</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}