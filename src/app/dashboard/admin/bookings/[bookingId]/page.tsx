import { db } from '@/lib/db';
import { bookings, users, providers, services, refunds } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { auth, clerkClient } from '@clerk/nextjs/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, CreditCard } from 'lucide-react';

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(cents / 100);

const formatDate = (date: Date | null) =>
  date ? new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—';

export default async function AdminBookingDetailPage({
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

  const { bookingId } = await params;

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
      providerId: providers.id,
      serviceTitle: services.title,
      serviceId: services.id,
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

  // Get refunds for this booking
  const bookingRefunds = await db
    .select({
      id: refunds.id,
      amount: refunds.amount,
      reason: refunds.reason,
      status: refunds.status,
      processedAt: refunds.processedAt,
    })
    .from(refunds)
    .where(eq(refunds.bookingId, bookingId))
    .orderBy(desc(refunds.createdAt));

  const totalRefunded = bookingRefunds
    .filter(r => r.status === 'completed')
    .reduce((sum, r) => sum + r.amount, 0);

  const canRefund = (booking.status === 'paid' || booking.status === 'completed') &&
                   totalRefunded < booking.priceAtBooking;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/dashboard/admin/bookings" className="hover:underline flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            Bookings
          </Link>
          <span>/</span>
          <span>{booking.id}</span>
        </div>

        {canRefund && (
          <Link href={`/dashboard/admin/bookings/${bookingId}/refunds`}>
            <Button>
              <CreditCard className="h-4 w-4 mr-2" />
              Process Refund
            </Button>
          </Link>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Booking Details */}
        <Card>
          <CardHeader>
            <CardTitle>Booking Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Booking ID</div>
                <div className="font-mono text-xs">{booking.id}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Status</div>
                <Badge variant={
                  booking.status === 'paid' ? 'default' :
                  booking.status === 'completed' ? 'secondary' :
                  booking.status === 'pending' ? 'outline' : 'destructive'
                }>
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
                <Link
                  href={`/dashboard/admin/providers/${booking.providerId}`}
                  className="hover:underline"
                >
                  {booking.providerBusinessName || `@${booking.providerHandle}`}
                </Link>
              </div>
              <div>
                <div className="text-muted-foreground">Service</div>
                <Link
                  href={`/s/${booking.serviceId}`}
                  target="_blank"
                  className="hover:underline"
                >
                  {booking.serviceTitle}
                </Link>
              </div>
              <div>
                <div className="text-muted-foreground">Scheduled</div>
                <div>{formatDate(booking.scheduledDate)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment & Refund Info */}
        <Card>
          <CardHeader>
            <CardTitle>Payment Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Total Amount</div>
                <div className="font-medium">{formatCurrency(booking.priceAtBooking)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Payment Status</div>
                <div>
                  {booking.paymentIntentId ? (
                    <Badge variant="default">Paid</Badge>
                  ) : (
                    <Badge variant="outline">Unpaid</Badge>
                  )}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Total Refunded</div>
                <div className="font-medium">{formatCurrency(totalRefunded)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Remaining</div>
                <div className="font-medium">
                  {formatCurrency(booking.priceAtBooking - totalRefunded)}
                </div>
              </div>
            </div>

            {booking.paymentIntentId && (
              <div>
                <div className="text-xs text-muted-foreground">Stripe Payment Intent</div>
                <div className="font-mono text-xs">{booking.paymentIntentId}</div>
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              Created: {formatDate(booking.createdAt)}
              {booking.updatedAt !== booking.createdAt && (
                <> • Updated: {formatDate(booking.updatedAt)}</>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Refunds History */}
      {bookingRefunds.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Refund History</CardTitle>
            <CardDescription>Previous refunds processed for this booking</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {bookingRefunds.map((refund) => (
                <div key={refund.id} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <div className="font-medium">{formatCurrency(refund.amount)}</div>
                    <div className="text-sm text-muted-foreground capitalize">
                      {refund.reason.replace('_', ' ')}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={
                      refund.status === 'completed' ? 'default' :
                      refund.status === 'processing' ? 'secondary' : 'destructive'
                    }>
                      {refund.status}
                    </Badge>
                    <div className="text-xs text-muted-foreground mt-1">
                      {refund.processedAt ? formatDate(refund.processedAt) : 'Processing...'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}