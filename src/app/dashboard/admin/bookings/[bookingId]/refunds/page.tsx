import { db } from '@/lib/db';
import { bookings, users, providers, services } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { auth, clerkClient } from '@clerk/nextjs/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminRefundConsole } from '@/components/admin/admin-refund-console';
import { BookingIdParamSchema, parseParamsOrNotFound } from '@/lib/validation/admin-loader-schemas';

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(cents / 100);

const formatDate = (date: Date | null) =>
  date ? new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium' }).format(date) : '—';

export default async function AdminRefundConsolePage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
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

  const { bookingId } = parseParamsOrNotFound(BookingIdParamSchema, await params);

  // Get booking details with related data
  const bookingData = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      priceAtBooking: bookings.priceAtBooking,
      paymentIntentId: bookings.paymentIntentId,
      scheduledDate: bookings.scheduledDate,
      createdAt: bookings.createdAt,
      updatedAt: bookings.updatedAt,
      customerFirstName: users.firstName,
      customerLastName: users.lastName,
      customerEmail: users.email,
      providerBusinessName: providers.businessName,
      providerHandle: providers.handle,
      serviceTitle: services.title,
      servicePrice: services.priceInCents,
    })
    .from(bookings)
    .innerJoin(users, eq(bookings.userId, users.id))
    .innerJoin(providers, eq(bookings.providerId, providers.id))
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (bookingData.length === 0) {
    notFound();
  }

  const booking = bookingData[0];

  // Calculate platform fee (10% as per create-intent route)
  const platformFeeBps = process.env.PLATFORM_FEE_BPS ? parseInt(process.env.PLATFORM_FEE_BPS) : 1000;
  const platformFeeAmount = Math.ceil(booking.priceAtBooking * (platformFeeBps / 10000));
  const providerAmount = booking.priceAtBooking - platformFeeAmount;

  const canRefund = booking.status === 'paid' || booking.status === 'completed';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <Link href="/dashboard/admin/bookings" className="hover:underline">
            Bookings
          </Link>
          <span>/</span>
          <span>Refund Console</span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Booking Details */}
        <Card>
          <CardHeader>
            <CardTitle>Booking Details</CardTitle>
            <CardDescription>Review booking information before processing refund</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Booking ID</div>
                <div className="font-mono text-xs">{booking.id}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Status</div>
                <Badge variant={booking.status === 'paid' ? 'default' : booking.status === 'completed' ? 'secondary' : 'outline'}>
                  {booking.status}
                </Badge>
              </div>
              <div>
                <div className="text-muted-foreground">Customer</div>
                <div>
                  {`${booking.customerFirstName ?? ''} ${booking.customerLastName ?? ''}`.trim() || 'Unknown'}
                  <div className="text-xs text-muted-foreground">{booking.customerEmail}</div>
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Provider</div>
                <div>
                  {booking.providerBusinessName || `@${booking.providerHandle}`}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Service</div>
                <div>{booking.serviceTitle}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Scheduled</div>
                <div>{formatDate(booking.scheduledDate)}</div>
              </div>
            </div>

            <div className="border-t pt-4 space-y-2">
              <div className="text-sm font-medium">Payment Breakdown</div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Total Paid</div>
                  <div className="font-medium">{formatCurrency(booking.priceAtBooking)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Platform Fee ({platformFeeBps / 100}%)</div>
                  <div>{formatCurrency(platformFeeAmount)}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-muted-foreground">Provider Amount</div>
                  <div>{formatCurrency(providerAmount)}</div>
                </div>
              </div>
            </div>

            {!canRefund && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                <div className="text-sm text-yellow-800">
                  <strong>Cannot Refund:</strong> Only paid or completed bookings can be refunded.
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Refund Console */}
        <Card>
          <CardHeader>
            <CardTitle>Process Refund</CardTitle>
            <CardDescription>Issue a refund for this booking</CardDescription>
          </CardHeader>
          <CardContent>
            {canRefund ? (
              <AdminRefundConsole
                bookingId={booking.id}
                maxRefundAmount={booking.priceAtBooking}
                platformFeeBps={platformFeeBps}
              />
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Refund not available for this booking status.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}