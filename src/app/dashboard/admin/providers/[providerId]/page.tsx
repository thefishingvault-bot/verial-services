import { db } from '@/lib/db';
import { bookings, providers, reviews, services, users, providerNotes } from '@/db/schema';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { auth, clerkClient } from '@clerk/nextjs/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminRecomputeTrustButton } from '@/components/admin/admin-recompute-trust-button';
import { AddProviderNote } from '@/components/admin/add-provider-note';
import { AdminProviderModerationControls } from '@/components/admin/admin-provider-moderation-controls';
import { parseParamsOrNotFound, ProviderIdParamSchema } from '@/lib/validation/admin-loader-schemas';
import { AdminProviderKycDocuments } from '@/components/admin/provider-kyc-documents';

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(cents / 100);

const toFiniteNumber = (value: unknown, fallback = 0) => {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const toValidDate = (value: unknown): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value: unknown) => {
  const date = toValidDate(value);
  return date
    ? new Intl.DateTimeFormat('en-NZ', {
        timeZone: 'Pacific/Auckland',
        dateStyle: 'medium',
      }).format(date)
    : '—';
};

const formatMonthYearNZ = (value: unknown) => {
  const date = toValidDate(value);
  return date
    ? new Intl.DateTimeFormat('en-NZ', {
        timeZone: 'Pacific/Auckland',
        month: 'long',
        year: 'numeric',
      }).format(date)
    : 'Unknown';
};

export default async function AdminProviderDetailPage({
  params,
}: {
  params: Promise<{ providerId: string }>;
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

  const { providerId } = parseParamsOrNotFound(ProviderIdParamSchema, await params);

  const provider = await db.query.providers.findFirst({
    where: eq(providers.id, providerId),
  });

  if (!provider) {
    notFound();
  }

  const [owner] = await db
    .select()
    .from(users)
    .where(eq(users.id, provider.userId))
    .limit(1);

  const [bookingStats] = await db
    .select({
      total: sql<number>`count(*)`,
      pending: sql<number>`sum(case when ${bookings.status}::text = 'pending' then 1 else 0 end)`,
      accepted: sql<number>`sum(case when ${bookings.status}::text = 'accepted' then 1 else 0 end)`,
      paid: sql<number>`sum(case when ${bookings.status}::text = 'paid' then 1 else 0 end)`,
      completed: sql<number>`sum(case when ${bookings.status}::text = 'completed' then 1 else 0 end)`,
      canceled: sql<number>`sum(case when ${bookings.status}::text in ('canceled_customer','canceled_provider') then 1 else 0 end)`,
      lifetimeRevenue: sql<number>`coalesce(sum(case when ${bookings.status}::text in ('paid','completed') then ${bookings.priceAtBooking} else 0 end), 0)`,
      lastBookingAt: sql<Date | null>`max(${bookings.createdAt})`,
    })
    .from(bookings)
    .where(eq(bookings.providerId, provider.id));

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const [recentCompletedStats] = await db
    .select({
      completedLast90Days: sql<number>`sum(case when ${bookings.status} = 'completed' then 1 else 0 end)`,
    })
    .from(bookings)
    .where(and(eq(bookings.providerId, provider.id), gte(bookings.createdAt, ninetyDaysAgo)));

  const [reviewStats] = await db
    .select({
      total: sql<number>`count(*)`,
      avgRating: sql<number | null>`avg(${reviews.rating})`,
      lastReviewAt: sql<Date | null>`max(${reviews.createdAt})`,
    })
    .from(reviews)
    .where(eq(reviews.providerId, provider.id));

  const recentBookings = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      createdAt: bookings.createdAt,
      scheduledDate: bookings.scheduledDate,
      priceAtBooking: bookings.priceAtBooking,
      customerFirstName: users.firstName,
      customerLastName: users.lastName,
      serviceTitle: services.title,
      serviceSlug: services.slug,
    })
    .from(bookings)
    .innerJoin(users, eq(bookings.userId, users.id))
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .where(eq(bookings.providerId, provider.id))
    .orderBy(desc(bookings.createdAt))
    .limit(5);

  const recentReviews = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      comment: reviews.comment,
      createdAt: reviews.createdAt,
      customerFirstName: users.firstName,
      customerLastName: users.lastName,
    })
    .from(reviews)
    .innerJoin(users, eq(reviews.userId, users.id))
    .where(eq(reviews.providerId, provider.id))
    .orderBy(desc(reviews.createdAt))
    .limit(5);

  const providerServices = await db
    .select()
    .from(services)
    .where(eq(services.providerId, provider.id))
    .orderBy(desc(services.createdAt))
    .limit(10);

  const [servicesCountRow] = await db
    .select({ total: sql<number>`count(*)` })
    .from(services)
    .where(eq(services.providerId, provider.id));

  const totalServices = servicesCountRow?.total ?? 0;

  const providerNotesList = await db
    .select({
      id: providerNotes.id,
      note: providerNotes.note,
      createdAt: providerNotes.createdAt,
      authorFirstName: users.firstName,
      authorLastName: users.lastName,
    })
    .from(providerNotes)
    .innerJoin(users, eq(providerNotes.createdBy, users.id))
    .where(eq(providerNotes.providerId, provider.id))
    .orderBy(desc(providerNotes.createdAt))
    .limit(10);

  const avgRating = toFiniteNumber(reviewStats?.avgRating, 0);
  const totalReviews = toFiniteNumber(reviewStats?.total, 0);
  const completedLast90Days = recentCompletedStats?.completedLast90Days ?? 0;

  const displayName = provider.businessName || `@${provider.handle}`;

  const locationLine = provider.baseSuburb && provider.baseRegion
    ? `Based in ${provider.baseSuburb}, ${provider.baseRegion}`
    : provider.baseRegion
    ? `Based in ${provider.baseRegion}`
    : 'Region not set';

  const radiusLine = provider.serviceRadiusKm && (provider.baseSuburb || provider.baseRegion)
    ? provider.baseSuburb
      ? `Within ${provider.serviceRadiusKm} km of ${provider.baseSuburb}`
      : `Within ${provider.serviceRadiusKm} km of ${provider.baseRegion}`
    : 'Not specified';

  const providerSinceDate = owner?.createdAt ?? provider.createdAt;
  const providerSinceSafe = toValidDate(providerSinceDate);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <Link href="/dashboard/admin/verifications" className="hover:underline">
            Verifications
          </Link>
          <span>/</span>
          <span>{displayName}</span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="md:col-span-1 lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              {owner?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={owner.avatarUrl}
                  alt={displayName}
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                  {displayName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <CardTitle className="text-2xl font-bold">{displayName}</CardTitle>
                <CardDescription className="space-x-1">
                  <span>@{provider.handle}</span>
                  <span>•</span>
                  <span>
                    Provider since{' '}
                    {formatMonthYearNZ(providerSinceSafe ?? providerSinceDate)}
                  </span>
                </CardDescription>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <Badge
                    variant={
                      provider.status === 'approved'
                        ? 'default'
                        : provider.status === 'pending'
                        ? 'secondary'
                        : 'destructive'
                    }
                  >
                    {provider.status}
                  </Badge>
                  {provider.isSuspended && (
                    <Badge variant="destructive">Suspended</Badge>
                  )}
                  <Badge variant="outline">
                    {provider.isVerified ? 'Verified' : 'Not verified'}
                  </Badge>
                  <Badge variant="outline">
                    Trust: {provider.trustLevel} ({provider.trustScore})
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 text-xs">
              <div>{locationLine}</div>
              <div className="flex flex-wrap gap-2 justify-end">
                <Badge variant={provider.chargesEnabled ? 'default' : 'outline'}>
                  Charges {provider.chargesEnabled ? 'enabled' : 'disabled'}
                </Badge>
                <Badge variant={provider.payoutsEnabled ? 'default' : 'outline'}>
                  Payouts {provider.payoutsEnabled ? 'enabled' : 'disabled'}
                </Badge>
                <Badge variant="outline">GST {provider.chargesGst ? 'on' : 'off'}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardFooter className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <div className="flex flex-wrap gap-4">
              <span>
                Provider ID: <code className="font-mono text-[11px]">{provider.id}</code>
              </span>
              <span>
                User ID: <code className="font-mono text-[11px]">{provider.userId}</code>
              </span>
            </div>
            <div className="flex flex-wrap gap-4">
              <span>Created: {formatDate(provider.createdAt)}</span>
              <span>Last updated: {formatDate(provider.updatedAt)}</span>
            </div>
          </CardFooter>
        </Card>

        <Card className="md:col-span-1 lg:col-span-1">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>Trust & Risk</CardTitle>
              <CardDescription>Signals and controls for this provider.</CardDescription>
            </div>
            <AdminRecomputeTrustButton providerId={provider.id} />
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-muted-foreground">Trust level</div>
                <div className="font-medium capitalize">{provider.trustLevel ?? 'Not available'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Verified provider</div>
                <div className="font-medium">{provider.isVerified ? 'Yes' : 'No'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Trust score</div>
                <div className="font-medium">{provider.trustScore ?? 'Not available'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Account email</div>
                <div className="font-medium break-all">{owner?.email ?? 'Not available'}</div>
              </div>
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="text-xs font-semibold">Behavioural signals</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-muted-foreground">Completed bookings (all time)</div>
                  <div className="font-medium">{bookingStats?.completed ?? 0}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Completed bookings (90 days)</div>
                  <div className="font-medium">{completedLast90Days}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Cancellations (all time)</div>
                  <div className="font-medium">{bookingStats?.canceled ?? 0}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Average rating</div>
                  <div className="font-medium">
                    {totalReviews === 0
                      ? 'Not available'
                      : `${avgRating.toFixed(1)} / 5 from ${totalReviews} review${
                          totalReviews === 1 ? '' : 's'
                        }`}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="md:col-span-1 lg:col-span-1">
          <CardHeader>
            <CardTitle>Provider details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 text-sm">
            <div className="space-y-2">
              <div>
                <div className="text-xs text-muted-foreground">Business name</div>
                <div>{provider.businessName}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Handle</div>
                <div>@{provider.handle}</div>
              </div>
              {provider.bio && (
                <div>
                  <div className="text-xs text-muted-foreground">Bio</div>
                  <div className="whitespace-pre-wrap wrap-break-word text-xs">{provider.bio}</div>
                </div>
              )}
              <div>
                <div className="text-xs text-muted-foreground">Charges GST</div>
                <div>{provider.chargesGst ? 'Yes' : 'No'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Service radius</div>
                <div>{radiusLine}</div>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <div className="text-xs text-muted-foreground">Account owner</div>
                <div>
                  {owner
                    ? `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim() || owner.email || owner.id
                    : 'Unknown user'}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Email</div>
                <div>{owner?.email ?? 'Not available'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">User created</div>
                <div>{owner?.createdAt ? formatDate(owner.createdAt) : 'Unknown'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Stripe Connect</div>
                {provider.stripeConnectId ? (
                  <div className="space-y-1">
                    <div>Connected to Stripe</div>
                    <div className="text-xs">
                      Charges: {provider.chargesEnabled ? 'enabled' : 'disabled'} · Payouts:{' '}
                      {provider.payoutsEnabled ? 'enabled' : 'disabled'}
                    </div>
                  </div>
                ) : (
                  <div>Stripe not connected</div>
                )}
              </div>

              <div id="kyc">
                <div className="text-xs text-muted-foreground">KYC</div>
                <div className="space-y-1">
                  <div className="capitalize">
                    {(provider.kycStatus ?? 'not_started').replace(/_/g, ' ')}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Submitted: {formatDate(provider.kycSubmittedAt)} · Verified: {formatDate(provider.kycVerifiedAt)}
                  </div>
                  <div className="text-xs space-y-2">
                    <div>
                      {provider.identityDocumentUrl ? (
                        <a href={provider.identityDocumentUrl} target="_blank" rel="noreferrer" className="hover:underline">
                          Identity document (legacy)
                        </a>
                      ) : (
                        <span className="text-muted-foreground">Identity document (legacy): —</span>
                      )}
                      <span className="text-muted-foreground"> · </span>
                      {provider.businessDocumentUrl ? (
                        <a href={provider.businessDocumentUrl} target="_blank" rel="noreferrer" className="hover:underline">
                          Business document (legacy)
                        </a>
                      ) : (
                        <span className="text-muted-foreground">Business document (legacy): —</span>
                      )}
                    </div>

                    <AdminProviderKycDocuments providerId={provider.id} />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-1 lg:col-span-1">
          <CardHeader>
            <CardTitle>Performance summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-muted-foreground">Total bookings</div>
                <div className="font-medium">{bookingStats?.total ?? 0}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Lifetime revenue</div>
                <div className="font-medium">
                  {formatCurrency(bookingStats?.lifetimeRevenue ?? 0)}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground">Pending</div>
                <div className="font-medium">{bookingStats?.pending ?? 0}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Accepted</div>
                <div className="font-medium">{bookingStats?.accepted ?? 0}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Paid</div>
                <div className="font-medium">{bookingStats?.paid ?? 0}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Completed</div>
                <div className="font-medium">{bookingStats?.completed ?? 0}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Canceled</div>
                <div className="font-medium">{bookingStats?.canceled ?? 0}</div>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Reviews</div>
              {totalReviews === 0 ? (
                <div className="text-xs">No reviews yet.</div>
              ) : (
                <div className="text-xs">
                  Average rating: {avgRating.toFixed(1)} / 5 ({totalReviews} review
                  {totalReviews === 1 ? '' : 's'})
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
              <div>
                <div>Last booking</div>
                <div className="font-medium">
                  {bookingStats?.lastBookingAt ? formatDate(bookingStats.lastBookingAt) : 'No bookings yet'}
                </div>
              </div>
              <div>
                <div>Last review</div>
                <div className="font-medium">
                  {reviewStats?.lastReviewAt ? formatDate(reviewStats.lastReviewAt) : 'No reviews yet'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-1 lg:col-span-1">
          <CardHeader>
            <CardTitle>Admin actions</CardTitle>
            <CardDescription>Moderation controls for this provider.</CardDescription>
          </CardHeader>
          <CardContent>
            {provider.isSuspended && (
              <div className="mb-3 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Suspended: {provider.suspensionReason ?? 'No reason provided'} · Start: {formatDate(provider.suspensionStartDate)}
              </div>
            )}
            <AdminProviderModerationControls
              providerId={provider.id}
              status={provider.status}
              isVerified={provider.isVerified}
              isSuspended={provider.isSuspended}
            />
          </CardContent>
        </Card>

        <Card className="md:col-span-1 lg:col-span-1">
          <CardHeader>
            <CardTitle>Internal Notes</CardTitle>
            <CardDescription>Admin-only notes about this provider.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {providerNotesList.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No internal notes yet.
              </div>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {providerNotesList.map((note) => (
                  <div key={note.id} className="border-l-2 border-muted pl-3 py-1">
                    <div className="text-xs text-muted-foreground mb-1">
                      {note.authorFirstName || note.authorLastName
                        ? `${note.authorFirstName ?? ''} ${note.authorLastName ?? ''}`.trim()
                        : 'Unknown admin'} • {formatDate(note.createdAt)}
                    </div>
                    <div className="text-sm whitespace-pre-wrap wrap-break-word">{note.note}</div>
                  </div>
                ))}
              </div>
            )}
            <AddProviderNote providerId={provider.id} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="md:col-span-2 lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent bookings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {recentBookings.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No bookings yet for this provider.
              </div>
            ) : (
              <div className="space-y-1 text-xs">
                <div className="grid grid-cols-5 gap-2 font-medium text-muted-foreground">
                  <span>Date</span>
                  <span>Service</span>
                  <span>Customer</span>
                  <span>Status</span>
                  <span className="text-right">Amount</span>
                </div>
                {recentBookings.map((b) => (
                  <div key={b.id} className="grid grid-cols-5 gap-2 items-center border-b py-1 last:border-b-0">
                    <span>{formatDate(b.scheduledDate ?? b.createdAt)}</span>
                    <span className="truncate">
                      {b.serviceSlug ? (
                        <Link href={`/s/${b.serviceSlug}`} target="_blank" className="hover:underline">
                          {b.serviceTitle ?? 'Service'}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Unknown service</span>
                      )}
                      <div className="font-mono text-[11px] text-muted-foreground">
                        <Link href={`/dashboard/admin/bookings/${b.id}`} className="hover:underline">
                          {b.id}
                        </Link>
                      </div>
                    </span>
                    <span className="truncate">
                      {`${b.customerFirstName ?? ''} ${b.customerLastName ?? ''}`.trim() || 'Unknown'}
                    </span>
                    <span>
                      <Badge variant="outline">{b.status}</Badge>
                    </span>
                    <span className="text-right">{formatCurrency(b.priceAtBooking)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2 lg:col-span-1">
          <CardHeader>
            <CardTitle>Recent reviews</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {recentReviews.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No reviews yet for this provider.
              </div>
            ) : (
              <ul className="space-y-2 text-xs">
                {recentReviews.map((r) => (
                  <li key={r.id} className="border-b last:border-b-0 pb-2 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {`${r.customerFirstName ?? ''} ${r.customerLastName ?? ''}`.trim() || 'Unknown'}
                      </span>
                      <span className="font-medium">{r.rating}/5</span>
                    </div>
                    <div className="text-muted-foreground">{formatDate(r.createdAt)}</div>
                    <div className="mt-1 text-xs">
                      {r.comment && r.comment.length > 120
                        ? `${r.comment.slice(0, 120)}…`
                        : r.comment || 'No comment provided.'}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Services</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>Total services: {totalServices}</div>
          {totalServices === 0 ? (
            <div className="text-sm text-muted-foreground">
              This provider has not created any services yet.
            </div>
          ) : (
            <>
              <div className="space-y-1 text-xs">
                <div className="grid grid-cols-4 gap-2 font-medium text-muted-foreground">
                  <span>Title</span>
                  <span>Category</span>
                  <span>Price</span>
                  <span>Created</span>
                </div>
                {providerServices.map((service) => (
                  <div key={service.id} className="grid grid-cols-4 gap-2 items-center border-b py-1 last:border-b-0">
                    <span className="truncate">
                      <Link
                        href={`/s/${service.slug}`}
                        target="_blank"
                        className="hover:underline"
                      >
                        {service.title}
                      </Link>
                    </span>
                    <span className="truncate text-xs">{service.category}</span>
                    <span className="truncate">
                      {service.priceInCents != null ? formatCurrency(service.priceInCents) : '—'}
                    </span>
                    <span className="truncate text-xs">{formatDate(service.createdAt)}</span>
                  </div>
                ))}
              </div>
              {totalServices > providerServices.length && (
                <div className="text-xs text-muted-foreground">
                  Showing {providerServices.length} of {totalServices} services.
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
