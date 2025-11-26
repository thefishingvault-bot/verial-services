import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminFeesFiltersBar } from '@/components/admin/admin-fees-filters-bar';

type SearchParams = Promise<{
  range?: string;
  from?: string;
  to?: string;
}>;

interface FeeReportRow {
  bookingId: string;
  status: string;
  paidAt: string;
  serviceTitle: string;
  providerName: string;
  customerEmail: string;
  totalAmount: number;
  platformFee: number;
}

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
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role;

  if (!userId || role !== 'admin') {
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

  const url = new URL('/api/admin/fees/report', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
  url.searchParams.set('from', fromIso);
  url.searchParams.set('to', toIso);

  const res = await fetch(url.toString(), { cache: 'no-store' });

  if (!res.ok) {
    return (
      <div className="text-sm text-destructive">
        We couldn&rsquo;t load fee data right now. Please try again later.
      </div>
    );
  }

  const reportData = (await res.json()) as FeeReportRow[];

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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin · Fees &amp; Revenue</h1>

      <Suspense>
        <AdminFeesFiltersBar />
      </Suspense>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Gross volume</CardTitle>
            <CardDescription>Gross booking volume in selected period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalGross)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Platform fees</CardTitle>
            <CardDescription>Fees collected in selected period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalFees)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Net to providers</CardTitle>
            <CardDescription>Net paid / owed to providers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(netToProviders)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Net to Verial</CardTitle>
            <CardDescription>Platform share after payouts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(netToVerial)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Avg fee rate: {(averageFeeRate * 100).toFixed(1)}%
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Revenue over time</h2>
          <p className="text-sm text-muted-foreground">
            Daily breakdown of gross volume and platform fees.
          </p>
        </div>
        <Card>
          <CardContent className="pt-4">
            {daily.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No fee activity in this period. Try broadening the date range.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Platform fees</TableHead>
                    <TableHead className="text-right">Net to Verial</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {daily.map((d) => (
                    <TableRow key={d.date}>
                      <TableCell>{d.date}</TableCell>
                      <TableCell className="text-right">{formatCurrency(d.gross)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(d.fees)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(d.netToVerial)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Per-provider breakdown</h2>
          <p className="text-sm text-muted-foreground">
            Performance by provider for the selected period.
          </p>
        </div>
        <Card>
          <CardContent className="pt-4">
            {providers.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No fee activity in this period.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Platform fees</TableHead>
                    <TableHead className="text-right">Net to Verial</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providers.map((p) => (
                    <TableRow key={p.providerName}>
                      <TableCell>
                        <div className="font-medium">{p.providerName}</div>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(p.totalGross)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(p.totalFees)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(p.totalNetToVerial)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

