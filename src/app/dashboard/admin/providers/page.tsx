import { db } from '@/lib/db';
import { providers, users } from '@/db/schema';
import { and, desc, eq, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { auth, clerkClient } from '@clerk/nextjs/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminProvidersFiltersBar } from '@/components/admin/admin-providers-filters-bar';
import { AdminProvidersSearchSchema, parseSearchParams } from '@/lib/validation/admin-loader-schemas';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PAGE_SIZE_DEFAULT = 20;

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium' }).format(date);
}

export default async function AdminProvidersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect('/dashboard');
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const role = user.publicMetadata.role;

  if (role !== 'admin') {
    redirect('/dashboard');
  }

  const params = parseSearchParams(AdminProvidersSearchSchema, await searchParams);

  const q = params.q;
  const status = params.status;
  const region = params.region;
  const stripe = params.stripe;
  const verified = params.verified;

  const page = Math.max(params.page, 1);
  const pageSize = Math.max(params.pageSize || PAGE_SIZE_DEFAULT, 1);

  const whereClauses = [] as (ReturnType<typeof and> | ReturnType<typeof or> | ReturnType<typeof eq> | ReturnType<typeof ilike> | ReturnType<typeof isNotNull>)[];

  if (q) {
    whereClauses.push(
      or(
        ilike(providers.businessName, `%${q}%`),
        ilike(providers.handle, `%${q}%`),
        ilike(users.email, `%${q}%`),
      ),
    );
  }

  if (status !== 'all') {
    whereClauses.push(eq(providers.status, status as 'pending' | 'approved' | 'rejected'));
  }

  if (region !== 'all') {
    whereClauses.push(eq(providers.baseRegion, region));
  }

  if (verified) {
    whereClauses.push(eq(providers.isVerified, true));
  }

  if (stripe === 'connected') {
    whereClauses.push(and(isNotNull(providers.stripeConnectId), eq(providers.chargesEnabled, true)));
  } else if (stripe === 'disconnected') {
    whereClauses.push(or(eq(providers.chargesEnabled, false), isNull(providers.stripeConnectId)));
  }

  const where = whereClauses.length ? and(...whereClauses) : undefined;

  const offset = (page - 1) * pageSize;

  const [rows, totalRow, kpiRow] = await Promise.all([
    db
      .select({
        id: providers.id,
        handle: providers.handle,
        businessName: providers.businessName,
        status: providers.status,
        isVerified: providers.isVerified,
        trustLevel: providers.trustLevel,
        baseRegion: providers.baseRegion,
        stripeConnectId: providers.stripeConnectId,
        chargesEnabled: providers.chargesEnabled,
        payoutsEnabled: providers.payoutsEnabled,
        createdAt: providers.createdAt,
      })
      .from(providers)
      .leftJoin(users, eq(users.id, providers.userId))
      .where(where)
      .orderBy(desc(providers.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({
        total: sql<number>`count(*)`,
      })
      .from(providers)
      .leftJoin(users, eq(users.id, providers.userId))
      .where(where)
      .then((rows) => rows[0]),
    db
      .select({
        totalProviders: sql<number>`count(*)`,
        approvedProviders: sql<number>`sum(case when ${providers.status} = 'approved' then 1 else 0 end)`,
        pendingProviders: sql<number>`sum(case when ${providers.status} = 'pending' then 1 else 0 end)`,
        rejectedProviders: sql<number>`sum(case when ${providers.status} = 'rejected' then 1 else 0 end)`,
        stripeConnected: sql<number>`sum(case when ${providers.stripeConnectId} is not null and ${providers.chargesEnabled} = true then 1 else 0 end)`,
      })
      .from(providers)
      .then((rows) => rows[0]),
  ]);

  const totalCount = totalRow?.total ?? 0;
  const hasNextPage = offset + rows.length < totalCount;

  const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);

  const regions = await db
    .selectDistinct({ region: providers.baseRegion })
    .from(providers)
    .where(isNotNull(providers.baseRegion))
    .orderBy(providers.baseRegion);

  const search = new URLSearchParams();
  if (q) search.set('q', q);
  if (status !== 'all') search.set('status', status);
  if (region !== 'all') search.set('region', region);
  if (stripe !== 'all') search.set('stripe', stripe);
  if (verified) search.set('verified', '1');
  search.set('pageSize', String(pageSize));

  const baseQuery = search.toString();

  const buildPageHref = (nextPage: number) => {
    const sp = new URLSearchParams(baseQuery);
    sp.set('page', String(nextPage));
    return `/dashboard/admin/providers?${sp.toString()}`;
  };

  const kpi = {
    totalProviders: kpiRow?.totalProviders ?? 0,
    approvedProviders: kpiRow?.approvedProviders ?? 0,
    pendingProviders: kpiRow?.pendingProviders ?? 0,
    rejectedProviders: kpiRow?.rejectedProviders ?? 0,
    stripeConnected: kpiRow?.stripeConnected ?? 0,
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader>
            <CardTitle>Total providers</CardTitle>
            <CardDescription>All-time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpi.totalProviders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Approved</CardTitle>
            <CardDescription>Status breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpi.approvedProviders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pending review</CardTitle>
            <CardDescription>Status breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpi.pendingProviders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Rejected</CardTitle>
            <CardDescription>Status breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpi.rejectedProviders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Stripe connected</CardTitle>
            <CardDescription>Charges enabled</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpi.stripeConnected}</div>
          </CardContent>
        </Card>
      </div>

      <AdminProvidersFiltersBar
        searchParams={{
          q,
          status,
          region,
          stripe,
          verified: verified ? '1' : undefined,
          page: String(page),
        }}
        regions={regions.map((r) => r.region!).filter(Boolean)}
      />

      <Card>
        <CardHeader>
          <CardTitle>Providers</CardTitle>
          <CardDescription>Searchable, filterable list of all providers.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              <div className="font-medium">No providers match these filters.</div>
              <div>Try clearing some filters or searching for a different name/handle.</div>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Verification</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Stripe</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">
                          {p.businessName || 'Unnamed provider'}
                        </div>
                        <div className="text-xs text-muted-foreground">@{p.handle}</div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            p.status === 'approved'
                              ? 'default'
                              : p.status === 'pending'
                              ? 'secondary'
                              : 'destructive'
                          }
                        >
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>
                          {p.isVerified ? 'Verified' : 'Not verified'}
                        </div>
                        <div className="text-muted-foreground">
                          Trust level {p.trustLevel}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.baseRegion || 'Not set'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.stripeConnectId
                          ? p.chargesEnabled && p.payoutsEnabled
                            ? 'Connected (charges + payouts)'
                            : p.chargesEnabled
                            ? 'Connected (charges only)'
                            : 'Connected (no charges)'
                          : 'Not connected'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(p.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/dashboard/admin/providers/${p.id}`}>
                            View
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between pt-4 text-xs text-muted-foreground">
                <div>
                  Page {page} of {totalPages} • Showing {rows.length} of {totalCount} providers
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    asChild
                  >
                    <Link href={buildPageHref(page - 1)}>Previous</Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!hasNextPage}
                    asChild
                  >
                    <Link href={buildPageHref(page + 1)}>Next</Link>
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
