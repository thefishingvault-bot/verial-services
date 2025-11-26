import { db } from '@/lib/db';
import { providers, users } from '@/db/schema';
import { and, eq, ilike, or, sql } from 'drizzle-orm';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminProvidersFiltersBar } from '@/components/admin/admin-providers-filters-bar';
import { AdminVerificationActions } from '@/components/admin/admin-verification-actions';

type SearchParams = Promise<{
  q?: string;
  status?: string;
  region?: string;
}>;

const MAX_RECENT_DECISIONS = 30;

const formatDateTime = (date: Date) =>
  new Intl.DateTimeFormat('en-NZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);

export default async function AdminVerificationsPage({
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

  const params = await searchParams;

  const q = (params.q ?? '').trim();
  const statusFilter = params.status ?? 'pending';
  const regionFilter = params.region ?? 'all';

  const baseWhere = [
    or(eq(providers.status, 'pending'), eq(providers.status, 'approved'), eq(providers.status, 'rejected')),
  ];

  if (q) {
    baseWhere.push(
      or(
        ilike(providers.businessName, `%${q}%`),
        ilike(providers.handle, `%${q}%`),
        ilike(users.email, `%${q}%`),
      ),
    );
  }

  if (regionFilter !== 'all') {
    baseWhere.push(eq(providers.baseRegion, regionFilter));
  }

  if (statusFilter !== 'all') {
    baseWhere.push(eq(providers.status, statusFilter as 'pending' | 'approved' | 'rejected'));
  }

  const where = and(...baseWhere);

  const [rows, regions] = await Promise.all([
    db
      .select({
        id: providers.id,
        businessName: providers.businessName,
        handle: providers.handle,
        status: providers.status,
        chargesEnabled: providers.chargesEnabled,
        payoutsEnabled: providers.payoutsEnabled,
        userId: providers.userId,
        baseSuburb: providers.baseSuburb,
        baseRegion: providers.baseRegion,
        serviceRadiusKm: providers.serviceRadiusKm,
        trustLevel: providers.trustLevel,
        isVerified: providers.isVerified,
        stripeConnectId: providers.stripeConnectId,
        createdAt: providers.createdAt,
        updatedAt: providers.updatedAt,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userEmail: users.email,
      })
      .from(providers)
      .innerJoin(users, eq(users.id, providers.userId))
      .where(where),
    db
      .selectDistinct({ region: providers.baseRegion })
      .from(providers)
      .where(sql`${providers.baseRegion} is not null`)
      .orderBy(providers.baseRegion),
  ]);

  const pending = rows
    .filter((p) => p.status === 'pending')
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const recentDecided = rows
    .filter((p) => p.status === 'approved' || p.status === 'rejected')
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, MAX_RECENT_DECISIONS);

  const regionList = regions.map((r) => r.region!).filter(Boolean);

  return (
    <div className="space-y-6">
      <AdminProvidersFiltersBar
        searchParams={{ q, status: statusFilter, region: regionFilter }}
        regions={regionList}
      />

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Pending verifications</h2>
          <span className="text-sm text-muted-foreground">{pending.length} waiting for review</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Queue</CardTitle>
          </CardHeader>
          <CardContent>
            {pending.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground space-y-1">
                <div className="font-medium">No providers waiting for review.</div>
                <div>New applications will appear here as soon as users submit them.</div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Person</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">
                          <Link href={`/dashboard/admin/providers/${p.id}`} className="hover:underline">
                            {p.businessName}
                          </Link>
                        </div>
                        <div className="text-xs text-muted-foreground">@{p.handle}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>
                          {`${p.userFirstName ?? ''} ${p.userLastName ?? ''}`.trim() || 'No name on file'}
                        </div>
                        <div className="text-muted-foreground">{p.userEmail}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.baseRegion || 'Region not set'}
                      </TableCell>
                      <TableCell className="text-xs space-y-1">
                        <div>
                          <Badge variant="outline">Trust: {p.trustLevel}</Badge>
                        </div>
                        <div className="text-muted-foreground">
                          {p.stripeConnectId ? 'Stripe: Connected' : 'Stripe: Not connected'} ·{' '}
                          {p.chargesEnabled ? 'Charges enabled' : 'Charges disabled'}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(p.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <AdminVerificationActions providerId={p.id} status={p.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Recently decided</h2>
          <span className="text-sm text-muted-foreground">
            {recentDecided.length === 0
              ? 'No recent decisions. Once you approve or reject providers, they will appear here.'
              : `${recentDecided.length} most recent decisions`}
          </span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Audit trail</CardTitle>
          </CardHeader>
          <CardContent>
            {recentDecided.length === 0 ? (
              <div className="py-6 text-sm text-muted-foreground">
                No recent decisions. Once you approve or reject providers, they will appear here.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Person</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last changed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentDecided.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">
                          <Link href={`/dashboard/admin/providers/${p.id}`} className="hover:underline">
                            {p.businessName}
                          </Link>
                        </div>
                        <div className="text-xs text-muted-foreground">@{p.handle}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>
                          {`${p.userFirstName ?? ''} ${p.userLastName ?? ''}`.trim() || 'No name on file'}
                        </div>
                        <div className="text-muted-foreground">{p.userEmail}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.baseRegion || 'Region not set'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={p.status === 'approved' ? 'default' : 'destructive'}
                          className="text-xs"
                        >
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(p.updatedAt)}
                      </TableCell>
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

