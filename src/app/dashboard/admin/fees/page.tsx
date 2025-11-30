import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AdminFeesFiltersBar } from '@/components/admin/admin-fees-filters-bar';
import { requireAdmin } from '@/lib/admin';
import { getAdminFeesReport, type FeeReportRow } from '@/server/admin/fees';
import {
  DollarSign,
  TrendingUp,
  Calendar,
  Users,
  Download,
  BarChart3,
  PieChart,
  ArrowUpDown,
  Filter
} from 'lucide-react';

type SearchParams = Promise<{
  range?: string;
  from?: string;
  to?: string;
}>;

interface DailyBucket {
  date: string;
  gross: number;
  fees: number;
  netToVerial: number;
}

interface ProviderBucket {
  providerName: string;
  totalGross: number;
  totalFees: number;
  totalNetToVerial: number;
}

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(cents / 100);

export default async function AdminFeesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await currentUser();
  if (!user?.id) {
    redirect('/dashboard');
  }

  try {
    await requireAdmin(user.id);
  } catch {
    redirect('/dashboard');
  }

  const params = await searchParams;

  const range = params.range ?? '30d';
  const fromParam = params.from;
  const toParam = params.to;

  const today = new Date();
  const endDate = toParam ? new Date(toParam) : today;
  let startDate: Date;

  switch (range) {
    case '7d':
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 6);
      break;
    case '30d':
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 29);
      break;
    case 'month': {
      startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
      break;
    }
    case 'ytd':
      startDate = new Date(endDate.getFullYear(), 0, 1);
      break;
    case 'all':
      startDate = new Date(2023, 0, 1);
      break;
    default:
      startDate = fromParam ? new Date(fromParam) : new Date(endDate);
  }

  if (fromParam && toParam) {
    startDate = new Date(fromParam);
  }

  const fromIso = startDate.toISOString().split('T')[0];
  const toIso = endDate.toISOString().split('T')[0];

  console.log('[ADMIN_FEES] Loading report for dates:', fromIso, 'to', toIso);

  let reportData: FeeReportRow[];
  try {
    reportData = await getAdminFeesReport({ from: fromIso, to: toIso });
  } catch (error) {
    console.error('[ADMIN_FEES] Failed to load fees report:', error);
    return (
      <div className="text-sm text-destructive">
        We couldn&rsquo;t load fee data right now. Please try again later.
      </div>
    );
  }

  const totalGross = reportData.reduce((sum, row) => sum + row.totalAmount, 0);
  const totalFees = reportData.reduce((sum, row) => sum + row.platformFee, 0);
  const netToProviders = totalGross - totalFees;
  const netToVerial = totalFees;
  const averageFeeRate = totalGross > 0 ? totalFees / totalGross : 0;

  const dailyMap = new Map<string, DailyBucket>();
  const providerMap = new Map<string, ProviderBucket>();

  for (const row of reportData) {
    const dateKey = row.paidAt.split('T')[0];
    const gross = row.totalAmount;
    const fees = row.platformFee;
    const net = fees;

    const existingDay = dailyMap.get(dateKey) ?? {
      date: dateKey,
      gross: 0,
      fees: 0,
      netToVerial: 0,
    };
    existingDay.gross += gross;
    existingDay.fees += fees;
    existingDay.netToVerial += net;
    dailyMap.set(dateKey, existingDay);

    const providerKey = row.providerName;
    const existingProvider = providerMap.get(providerKey) ?? {
      providerName: providerKey,
      totalGross: 0,
      totalFees: 0,
      totalNetToVerial: 0,
    };
    existingProvider.totalGross += gross;
    existingProvider.totalFees += fees;
    existingProvider.totalNetToVerial += net;
    providerMap.set(providerKey, existingProvider);
  }

  const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  const providerFilter = (params as { provider?: string }).provider?.toLowerCase() ?? '';

  const providers = Array.from(providerMap.values())
    .filter((p) =>
      providerFilter
        ? p.providerName.toLowerCase().includes(providerFilter)
        : true,
    )
    .sort((a, b) => b.totalGross - a.totalGross);

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Revenue Analytics</h1>
            <p className="text-muted-foreground mt-2">
              Monitor platform fees, revenue trends, and provider performance.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
          <Button variant="outline">
            <BarChart3 className="mr-2 h-4 w-4" />
            Advanced Analytics
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Suspense>
        <AdminFeesFiltersBar />
      </Suspense>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gross Volume</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalGross)}</div>
            <p className="text-xs text-muted-foreground">
              Total booking value
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Platform Fees</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalFees)}</div>
            <p className="text-xs text-muted-foreground">
              Revenue collected
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net to Providers</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{formatCurrency(netToProviders)}</div>
            <p className="text-xs text-muted-foreground">
              Paid to providers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net to Verial</CardTitle>
            <PieChart className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{formatCurrency(netToVerial)}</div>
            <p className="text-xs text-muted-foreground">
              Platform margin: {(averageFeeRate * 100).toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Over Time */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Revenue Over Time
          </CardTitle>
          <CardDescription>
            Daily breakdown of gross volume and platform fees for the selected period.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {daily.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No fee activity in this period.</p>
              <p className="text-sm">Try broadening the date range to see more data.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <div className="flex items-center gap-2">
                      Date
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right">Gross Volume</TableHead>
                  <TableHead className="text-right">Platform Fees</TableHead>
                  <TableHead className="text-right">Net Revenue</TableHead>
                  <TableHead className="text-right">Fee Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {daily.map((d) => {
                  const feeRate = d.gross > 0 ? (d.fees / d.gross) * 100 : 0;
                  return (
                    <TableRow key={d.date}>
                      <TableCell className="font-medium">
                        {new Date(d.date).toLocaleDateString('en-NZ', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(d.gross)}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        {formatCurrency(d.fees)}
                      </TableCell>
                      <TableCell className="text-right text-purple-600 font-medium">
                        {formatCurrency(d.netToVerial)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="text-xs">
                          {feeRate.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Per-Provider Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Provider Performance
          </CardTitle>
          <CardDescription>
            Revenue breakdown by provider for the selected period.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {providers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No provider activity in this period.</p>
              <p className="text-sm">Try broadening the date range or adjusting filters.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <div className="flex items-center gap-2">
                      Provider
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right">Gross Volume</TableHead>
                  <TableHead className="text-right">Platform Fees</TableHead>
                  <TableHead className="text-right">Net Revenue</TableHead>
                  <TableHead className="text-right">Fee Rate</TableHead>
                  <TableHead className="text-right">Contribution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.map((p) => {
                  const feeRate = p.totalGross > 0 ? (p.totalFees / p.totalGross) * 100 : 0;
                  const contributionPercent = totalFees > 0 ? (p.totalFees / totalFees) * 100 : 0;
                  return (
                    <TableRow key={p.providerName}>
                      <TableCell>
                        <div className="font-medium">{p.providerName}</div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(p.totalGross)}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        {formatCurrency(p.totalFees)}
                      </TableCell>
                      <TableCell className="text-right text-purple-600 font-medium">
                        {formatCurrency(p.totalNetToVerial)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="text-xs">
                          {feeRate.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className="text-xs">
                          {contributionPercent.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

