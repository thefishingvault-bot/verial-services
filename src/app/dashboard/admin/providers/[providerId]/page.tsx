import { db } from '@/lib/db';
import { bookings, providers, reviews, services, users } from '@/db/schema';
import { and, desc, eq, gte } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(cents / 100);

const formatDate = (date: Date | null) =>
  date ? new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium' }).format(date) : '—';

export const runtime = 'nodejs';

export default async function AdminProviderDetailPage({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  const provider = await db.query.providers.findFirst({
    where: eq(providers.id, providerId),
  });

  if (!provider) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Provider not found</h2>
        <p className="text-muted-foreground">
          No provider exists with ID <code className="font-mono text-sm">{providerId}</code>.
        </p>
        <Button asChild>
          <Link href="/dashboard/admin/verifications">Back to verifications</Link>
        </Button>
      </div>
    );
  }

  const owner = await db.query.users.findFirst({
    where: eq(users.id, provider.userId),
  });

  const providerServices = await db
    .select()
    .from(services)
    .where(eq(services.providerId, provider.id))
    .orderBy(desc(services.createdAt))
    .limit(5);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const providerBookings = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.providerId, provider.id),
        gte(bookings.createdAt, sixMonthsAgo),
      ),
    )
    .orderBy(desc(bookings.createdAt))
    .limit(50);

  const providerReviews = await db
    .select()
    .from(reviews)
    .where(eq(reviews.providerId, provider.id))
    .orderBy(desc(reviews.createdAt))
    .limit(20);

  const totalServices = providerServices.length;

  const totalBookings = providerBookings.length;
  const completedBookings = providerBookings.filter((b) => b.status === 'completed').length;
  const canceledBookings = providerBookings.filter((b) => b.status === 'canceled').length;
  const paidBookings = providerBookings.filter((b) => b.status === 'paid').length;
  const totalRevenueCents = providerBookings
    .filter((b) => b.status === 'completed')
    .reduce((sum, b) => sum + b.priceAtBooking, 0);

  const totalReviews = providerReviews.length;
  const avgRating = totalReviews
    ? providerReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
    : 0;

  const recentBookings = providerBookings.slice(0, 5);
  const recentReviews = providerReviews.slice(0, 3);

  const displayName = provider.businessName || `@${provider.handle}`;

  const locationLabel = provider.serviceRadiusKm && (provider.baseSuburb || provider.baseRegion)
    ? provider.baseSuburb
      ? `${provider.serviceRadiusKm} km from ${provider.baseSuburb}${provider.baseRegion ? `, ${provider.baseRegion}` : ''}`
      : `${provider.serviceRadiusKm} km in ${provider.baseRegion}`
    : 'Location not set';

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-3xl font-bold">{displayName}</h2>
            <p className="text-muted-foreground">@{provider.handle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={provider.status === 'approved' ? 'default' : provider.status === 'pending' ? 'secondary' : 'destructive'}>
              {provider.status}
            </Badge>
            <Badge variant="outline">Trust: {provider.trustLevel}</Badge>
            {provider.isVerified && <Badge variant="outline">Verified provider</Badge>}
            <Badge variant="outline">{locationLabel}</Badge>
            <Badge variant={provider.chargesEnabled ? 'default' : 'outline'}>
              Charges {provider.chargesEnabled ? 'enabled' : 'disabled'}
            </Badge>
            <Badge variant={provider.payoutsEnabled ? 'default' : 'outline'}>
              Payouts {provider.payoutsEnabled ? 'enabled' : 'disabled'}
            </Badge>
            <Badge variant="outline">GST {provider.chargesGst ? 'on' : 'off'}</Badge>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href={`/p/${provider.handle}`} target="_blank">
              Open public profile
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/admin/fees?providerId=${provider.id}`}>
              View provider in fees report
            </Link>
          </Button>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <span>Provider ID:</span>
            <code className="font-mono text-[11px]">{provider.id}</code>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <span>User ID:</span>
            <code className="font-mono text-[11px]">{provider.userId}</code>
          </div>
        </div>

        <div className="mt-2 text-xs text-muted-foreground flex flex-wrap gap-4">
          <span>Created: {formatDate(provider.createdAt)}</span>
          <span>Last updated: {formatDate(provider.updatedAt)}</span>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Account overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Business name</div>
              <div>{provider.businessName}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Handle</div>
              <div>@{provider.handle}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Owner</div>
              <div>
                {owner
                  ? `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim() || owner.email || owner.id
                  : 'Unknown user'}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Owner email</div>
              <div>{owner?.email ?? 'Not available'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Status & trust</div>
              <div>
                {provider.status} · {provider.trustLevel} ({provider.trustScore})
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Location</div>
              <div>{locationLabel}</div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span>Charges: {provider.chargesEnabled ? 'enabled' : 'disabled'}</span>
              <span>Payouts: {provider.payoutsEnabled ? 'enabled' : 'disabled'}</span>
              <span>GST: {provider.chargesGst ? 'on' : 'off'}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Services</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>Total services: {totalServices}</div>
            {totalServices === 0 ? (
              <div className="text-muted-foreground text-sm">
                This provider hasn&apos;t created any services yet.
              </div>
            ) : (
              <ul className="space-y-1">
                {providerServices.map((service) => (
                  <li key={service.id} className="border-b last:border-b-0 pb-1 last:pb-0">
                    <div className="font-medium">{service.title}</div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
                      <span>{service.category}</span>
                      {service.priceInCents != null && (
                        <span>{formatCurrency(service.priceInCents)}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-1 xl:col-span-1">
          <CardHeader>
            <CardTitle>Bookings & revenue (snapshot)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground">Total bookings (last 6 months)</div>
                <div className="font-medium">{totalBookings}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Completed</div>
                <div className="font-medium">{completedBookings}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Canceled</div>
                <div className="font-medium">{canceledBookings}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Paid</div>
                <div className="font-medium">{paidBookings}</div>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total revenue (completed)</div>
              <div className="font-semibold">{formatCurrency(totalRevenueCents)}</div>
            </div>
            <div className="mt-2 space-y-1">
              <div className="text-xs text-muted-foreground">Most recent bookings</div>
              {recentBookings.length === 0 ? (
                <div className="text-xs text-muted-foreground">No bookings yet for this provider.</div>
              ) : (
                <ul className="space-y-1 text-xs">
                  {recentBookings.map((b) => (
                    <li key={b.id} className="flex justify-between gap-2">
                      <span className="font-mono text-[11px] truncate">{b.id}</span>
                      <span>{b.status}</span>
                      <span>{formatDate(b.scheduledDate)}</span>
                      <span>{formatCurrency(b.priceAtBooking)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 xl:col-span-1">
          <CardHeader>
            <CardTitle>Reviews</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {totalReviews === 0 ? (
              <div className="text-muted-foreground text-sm">
                No reviews yet for this provider.
              </div>
            ) : (
              <>
                <div className="text-sm font-medium">
                  {avgRating.toFixed(1)} / 5 based on {totalReviews} review{totalReviews === 1 ? '' : 's'}
                </div>
                <ul className="space-y-2 text-xs">
                  {recentReviews.map((r) => (
                    <li key={r.id} className="border-b last:border-b-0 pb-2 last:pb-0">
                      <div className="font-medium">Rating: {r.rating}/5</div>
                      <div className="text-muted-foreground">{formatDate(r.createdAt)}</div>
                      <div className="mt-1">
                        {r.comment?.trim() ? r.comment : 'No comment provided.'}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
