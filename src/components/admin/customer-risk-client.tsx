'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Users, TrendingUp, Shield, Star } from 'lucide-react';

interface CustomerRiskData {
  customerId: string;
  customerName: string;
  customerEmail: string;
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  pendingBookings: number;
  confirmedBookings: number;
  paidBookings: number;
  totalSpent: number;
  avgBookingValue: number;
  lastBookingDate: string;
  firstBookingDate: string;
  cancellationRate: number;
  bookingFrequency: number;
  totalReviews: number;
  avgRating: number;
  totalDisputes: number;
  accountAge: number;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  riskFactors: {
    highCancellationRate: boolean;
    frequentBookings: boolean;
    lowRatings: boolean;
    hasDisputes: boolean;
    newAccount: boolean;
    veryNewAccount: boolean;
  };
}

interface Stats {
  totalCustomers: number;
  highRiskCustomers: number;
  mediumRiskCustomers: number;
  lowRiskCustomers: number;
  avgCancellationRate: number;
  totalDisputes: number;
  avgBookingValue: number;
}

interface CustomerRiskResponse {
  customers: CustomerRiskData[];
  stats: Stats;
  timeframe: string;
  riskLevel: string;
}

export function CustomerRiskClient() {
  const [data, setData] = useState<CustomerRiskResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('30d');
  const [riskLevel, setRiskLevel] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ timeframe, riskLevel });
      const response = await fetch(`/api/admin/customer-risk?${params}`);
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Error fetching customer risk data:', error);
    } finally {
      setLoading(false);
    }
  }, [riskLevel, timeframe]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'secondary';
      case 'low':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
    }).format(amount / 100);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  if (loading) {
    return <div>Loading customer risk signals...</div>;
  }

  if (!data) {
    return <div>Error loading data</div>;
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
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
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Risk Level</label>
              <Select value={riskLevel} onValueChange={setRiskLevel}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="high">High Risk</SelectItem>
                  <SelectItem value="medium">Medium Risk</SelectItem>
                  <SelectItem value="low">Low Risk</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.stats.totalCustomers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Risk</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{data.stats.highRiskCustomers}</div>
            <p className="text-xs text-muted-foreground">
              {data.stats.totalCustomers > 0 ? formatPercentage((data.stats.highRiskCustomers / data.stats.totalCustomers) * 100) : '0%'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Cancellation Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercentage(data.stats.avgCancellationRate || 0)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Disputes</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.stats.totalDisputes}</div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Risk Distribution</CardTitle>
          <CardDescription>Breakdown of customers by risk level</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded"></div>
                <span className="text-sm">Low Risk</span>
              </div>
              <span className="text-sm font-medium">{data.stats.lowRiskCustomers}</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full"
                style={{ width: `${data.stats.totalCustomers > 0 ? (data.stats.lowRiskCustomers / data.stats.totalCustomers) * 100 : 0}%` }}
              ></div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-yellow-500 rounded"></div>
                <span className="text-sm">Medium Risk</span>
              </div>
              <span className="text-sm font-medium">{data.stats.mediumRiskCustomers}</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-yellow-500 h-2 rounded-full"
                style={{ width: `${data.stats.totalCustomers > 0 ? (data.stats.mediumRiskCustomers / data.stats.totalCustomers) * 100 : 0}%` }}
              ></div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded"></div>
                <span className="text-sm">High Risk</span>
              </div>
              <span className="text-sm font-medium">{data.stats.highRiskCustomers}</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-red-500 h-2 rounded-full"
                style={{ width: `${data.stats.totalCustomers > 0 ? (data.stats.highRiskCustomers / data.stats.totalCustomers) * 100 : 0}%` }}
              ></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Customer Risk Analysis</CardTitle>
          <CardDescription>Detailed risk assessment for each customer</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Risk Level</TableHead>
                <TableHead>Risk Score</TableHead>
                <TableHead>Bookings</TableHead>
                <TableHead>Cancellation Rate</TableHead>
                <TableHead>Avg Rating</TableHead>
                <TableHead>Disputes</TableHead>
                <TableHead>Total Spent</TableHead>
                <TableHead>Risk Factors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.customers.map((customer) => (
                <TableRow key={customer.customerId}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{customer.customerName}</div>
                      <div className="text-sm text-muted-foreground">{customer.customerEmail}</div>
                      <div className="text-xs text-muted-foreground">
                        Account age: {Math.round(customer.accountAge)} days
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getRiskColor(customer.riskLevel)}>
                      {customer.riskLevel.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{customer.riskScore}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div>Total: {customer.totalBookings}</div>
                      <div className="text-muted-foreground">
                        Completed: {customer.completedBookings}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">
                      {formatPercentage(customer.cancellationRate || 0)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3" />
                      <span className="text-sm">
                        {customer.avgRating ? customer.avgRating.toFixed(1) : 'N/A'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={customer.totalDisputes > 0 ? 'destructive' : 'outline'}>
                      {customer.totalDisputes}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatCurrency(customer.totalSpent || 0)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {customer.riskFactors.highCancellationRate && (
                        <Badge variant="outline" className="text-xs">High Cancel</Badge>
                      )}
                      {customer.riskFactors.frequentBookings && (
                        <Badge variant="outline" className="text-xs">Frequent</Badge>
                      )}
                      {customer.riskFactors.lowRatings && (
                        <Badge variant="outline" className="text-xs">Low Rating</Badge>
                      )}
                      {customer.riskFactors.hasDisputes && (
                        <Badge variant="outline" className="text-xs">Disputes</Badge>
                      )}
                      {customer.riskFactors.newAccount && (
                        <Badge variant="outline" className="text-xs">New</Badge>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}