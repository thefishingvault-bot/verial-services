'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, Package } from 'lucide-react';
import { ReviewForm } from '@/components/reviews/review-form';
import { getFinalBookingAmountCents } from '@/lib/booking-price';

// Define a type for our joined booking data
type CustomerBookingStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'paid'
  | 'completed_by_provider'
  | 'completed'
  | 'canceled_customer'
  | 'canceled_provider'
  | 'disputed'
  | 'refunded';

interface CustomerBooking {
  id: string;
  status: CustomerBookingStatus;
  createdAt: string;
  scheduledDate?: string | null;
  priceAtBooking: number;
  providerQuotedPrice?: number | null;
  service: { title: string; slug: string; pricingType: 'fixed' | 'from' | 'quote' };
  provider: {
    id: string;
    businessName: string;
    handle: string;
    stripeConnectId: string;
    isVerified?: boolean;
    trustLevel?: string;
    baseSuburb: string | null;
    baseRegion: string | null;
    serviceRadiusKm: number | null;
  };
  hasReview?: boolean;
  review: { id: string } | null;
}

// Helper to format currency
const formatPrice = (priceInCents: number) => {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
  }).format(priceInCents / 100);
};

const formatDateTime = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-NZ', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
};

const toTitleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const getStatusLabel = (status: CustomerBooking['status']) => {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'accepted':
      return 'Accepted';
    case 'paid':
      return 'Paid';
    case 'completed':
      return 'Completed';
    case 'completed_by_provider':
      return 'Awaiting confirmation';
    case 'declined':
      return 'Declined';
    case 'canceled_customer':
    case 'canceled_provider':
      return 'Canceled';
    case 'disputed':
      return 'Disputed';
    case 'refunded':
      return 'Refunded';
    default:
      return toTitleCase(status);
  }
};

const getNextStep = (status: CustomerBooking['status']) => {
  switch (status) {
    case 'pending':
      return 'Next: Waiting for the provider to respond.';
    case 'accepted':
      return 'Next: Pay to confirm your booking.';
    case 'paid':
      return 'Next: Your booking is confirmed — the provider will complete the service.';
    case 'completed_by_provider':
      return 'Next: Confirm completion to release the provider payout.';
    case 'completed':
      return 'Completed — you can leave a review or book again.';
    case 'declined':
      return 'Declined — browse services to book another provider.';
    case 'canceled_customer':
      return 'Canceled by you.';
    case 'canceled_provider':
      return 'Canceled by the provider.';
    case 'disputed':
      return 'In dispute — our team will review this.';
    case 'refunded':
      return 'Refunded.';
    default:
      return '';
  }
};

// Helper to get styling for different badge statuses
const getStatusBadgeVariant = (
  status: CustomerBooking['status']
): 'default' | 'secondary' | 'destructive' | 'outline' => {
  switch (status) {
    case 'paid':
    case 'completed':
      return 'default';
    case 'completed_by_provider':
      return 'secondary';
    case 'accepted':
      return 'secondary';
    case 'pending':
      return 'outline';
    case 'declined':
    case 'canceled_customer':
    case 'canceled_provider':
      return 'destructive';
    case 'disputed':
    case 'refunded':
      return 'secondary';
    default:
      return 'secondary';
  }
};

export default function CustomerBookingsPage() {
  const [bookings, setBookings] = useState<CustomerBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const [stripeReturnSignal, setStripeReturnSignal] = useState<string | null>(null);
  const [stripeReturnBookingId, setStripeReturnBookingId] = useState<string | null>(null);
  const [stripeReturnSessionId, setStripeReturnSessionId] = useState<string | null>(null);
  const handledStripeReturn = useRef(false);

  const fetchBookings = useCallback(async (opts?: { showLoader?: boolean }) => {
    const showLoader = opts?.showLoader ?? true;
    if (showLoader) setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/bookings/list', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch your bookings.');
      const data = (await res.json()) as CustomerBooking[];
      setBookings(data);
      return data;
    } catch (err) {
      setError((err as Error).message ?? 'Failed to fetch your bookings.');
      return null;
    } finally {
      if (showLoader) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBookings({ showLoader: true });
  }, [fetchBookings]);

  useEffect(() => {
    // Client-only: read Stripe redirect params from current URL.
    const params = new URLSearchParams(window.location.search);

    const signal =
      (params.get('success') === '1' && 'success=1') ||
      (params.get('redirect_status') === 'succeeded' && 'redirect_status=succeeded') ||
      (params.get('payment_intent') ? 'payment_intent' : null) ||
      (params.get('payment_intent_client_secret') ? 'payment_intent_client_secret' : null);

    if (signal) setStripeReturnSignal(signal);

    const bookingId = params.get('bookingId');
    if (bookingId) setStripeReturnBookingId(bookingId);

    const sessionId = params.get('session_id');
    if (sessionId) setStripeReturnSessionId(sessionId);
  }, []);

  useEffect(() => {
    if (!stripeReturnSignal) return;
    if (handledStripeReturn.current) return;
    handledStripeReturn.current = true;

    const run = async () => {
      // 1) Best-effort: sync server-side first.
      if (stripeReturnBookingId) {
        try {
          await fetch(`/api/bookings/${encodeURIComponent(stripeReturnBookingId)}/sync-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: stripeReturnSessionId }),
            cache: 'no-store',
          });
        } catch {
          // ignore
        }
      }

      // 2) Remove success params so it doesn't re-trigger.
      router.replace('/dashboard/bookings', { scroll: false });

      // 3) Silent refresh from API (source of truth).
      await fetchBookings({ showLoader: false });

      // 4) Poll briefly to pick up webhook-driven updates; stop early once paid.
      const startedAt = Date.now();
      const interval = window.setInterval(async () => {
        const latest = await fetchBookings({ showLoader: false });

        const target = stripeReturnBookingId
          ? latest?.find((booking) => booking.id === stripeReturnBookingId) ?? null
          : null;

        if (target?.status === 'paid' || Date.now() - startedAt >= 8000) {
          window.clearInterval(interval);
        }
      }, 1200);
    };

    void run();
  }, [stripeReturnSignal, stripeReturnBookingId, stripeReturnSessionId, fetchBookings, router]);

  const handlePayNow = async (booking: CustomerBooking) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(booking.id)}/pay`, {
        method: 'POST',
        cache: 'no-store',
      });

      if (!res.ok) throw new Error(await res.text());

      const data = (await res.json()) as { url?: string };
      if (!data.url) throw new Error('Missing Stripe Checkout URL.');

      window.location.href = data.url;
    } catch (err) {
      setError((err as Error).message ?? 'Failed to start checkout.');
      setIsLoading(false);
    }
  };

  const handleConfirmCompletion = async (bookingId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/confirm-completion`, {
        method: 'POST',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(await res.text());

      router.refresh();
      fetchBookings();
    } catch (err) {
      setError((err as Error).message ?? 'Failed to confirm completion.');
      setIsLoading(false);
    }
  };

  const handleCancel = async (bookingId: string) => {
    if (!confirm('Are you sure you want to cancel this booking request?')) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/bookings/cancel', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      });

      if (!res.ok) throw new Error(await res.text());

      // Refresh list
      fetchBookings();
    } catch (err) {
      setError((err as Error).message ?? 'Failed to cancel booking.');
      setIsLoading(false);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="ml-2 text-muted-foreground">Loading your bookings...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center p-8 text-destructive">
          <AlertTriangle className="h-6 w-6 mr-2" />
          <p>{error}</p>
        </div>
      );
    }

    if (bookings.length === 0) {
      return (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-muted-foreground" />
              No bookings yet
            </CardTitle>
            <CardDescription>When you book a service, it will appear here.</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild>
              <Link href="/services">Browse services</Link>
            </Button>
          </CardFooter>
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        {bookings.map((booking) => (
          <Card key={booking.id}>
            <CardHeader className="space-y-2">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <CardTitle>
                    <Link href={`/dashboard/bookings/${booking.id}`} className="hover:underline">
                      {booking.service.title}
                    </Link>
                  </CardTitle>
                  <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>
                      {booking.provider.businessName} (@{booking.provider.handle})
                    </span>
                    {booking.provider.isVerified && <Badge variant="secondary">Verified</Badge>}
                    {booking.provider.trustLevel && (
                      <Badge variant="outline">{toTitleCase(booking.provider.trustLevel)}</Badge>
                    )}
                  </CardDescription>
                  <p className="text-sm text-muted-foreground">{getNextStep(booking.status)}</p>
                </div>

                <div className="flex items-center justify-between gap-3 md:flex-col md:items-end md:justify-start">
                  <Badge variant={getStatusBadgeVariant(booking.status)} className="w-fit">
                    {getStatusLabel(booking.status)}
                  </Badge>
                  <div className="text-right">
                    <p className="text-xs font-medium text-muted-foreground">Price</p>
                    <p className="font-semibold leading-tight">
                      {formatPrice(
                        booking.providerQuotedPrice != null && booking.providerQuotedPrice > 0
                          ? booking.providerQuotedPrice
                          : booking.priceAtBooking,
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Requested</span>
                <p className="text-sm">{formatDateTime(booking.createdAt) ?? '—'}</p>
              </div>

              <div className="space-y-1 md:text-right">
                <span className="text-xs font-medium text-muted-foreground">Scheduled</span>
                <p className="text-sm">{formatDateTime(booking.scheduledDate) ?? 'To be confirmed'}</p>
              </div>

              {booking.provider.serviceRadiusKm &&
                (booking.provider.baseSuburb || booking.provider.baseRegion) && (
                  <div className="md:col-span-2">
                    <span className="text-xs font-medium text-muted-foreground">Service area</span>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {booking.provider.baseSuburb
                        ? `Up to ${booking.provider.serviceRadiusKm} km from ${booking.provider.baseSuburb}`
                        : `Up to ${booking.provider.serviceRadiusKm} km in ${booking.provider.baseRegion}`}
                    </p>
                  </div>
                )}
            </CardContent>

            <CardFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href={`/dashboard/bookings/${booking.id}`}>View details</Link>
              </Button>

              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                {booking.status === 'pending' && (
                  <Button
                    variant="destructive"
                    onClick={() => handleCancel(booking.id)}
                    className="w-full sm:w-auto"
                  >
                    Cancel request
                  </Button>
                )}
                {booking.status === 'accepted' && (
                  <>
                    {(() => {
                      const finalAmount = getFinalBookingAmountCents({
                        providerQuotedPrice: booking.providerQuotedPrice ?? null,
                        priceAtBooking: booking.priceAtBooking,
                      });
                      const hasFinalAmount = typeof finalAmount === 'number' && finalAmount > 0;

                      return hasFinalAmount ? (
                        <Button onClick={() => handlePayNow(booking)} className="w-full sm:w-auto">
                          Pay now
                        </Button>
                      ) : (
                        <Button variant="outline" disabled className="w-full sm:w-auto">
                          Waiting for quote
                        </Button>
                      );
                    })()}
                    <Button
                      variant="outline"
                      onClick={() => handleCancel(booking.id)}
                      className="w-full sm:w-auto"
                    >
                      Cancel
                    </Button>
                  </>
                )}
                {booking.status === 'paid' && (
                  <Button variant="outline" disabled className="w-full sm:w-auto">
                    Paid
                  </Button>
                )}
                {booking.status === 'completed_by_provider' && (
                  <Button onClick={() => handleConfirmCompletion(booking.id)} className="w-full sm:w-auto">
                    Confirm completion
                  </Button>
                )}
                {booking.status === 'completed' && !(booking.hasReview ?? Boolean(booking.review)) && (
                  <ReviewForm
                    bookingId={booking.id}
                    serviceTitle={booking.service.title}
                    onReviewSubmit={(reviewedBookingId) => {
                      setBookings((prev) =>
                        prev.map((item) =>
                          item.id === reviewedBookingId
                            ? {
                                ...item,
                                hasReview: true,
                              }
                            : item,
                        ),
                      );
                      void fetchBookings({ showLoader: false });
                    }}
                  />
                )}
                {booking.status === 'completed' && (booking.hasReview ?? Boolean(booking.review)) && (
                  <Button variant="outline" disabled className="w-full sm:w-auto">
                    Review submitted
                  </Button>
                )}
                {booking.status === 'completed' && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => router.push(`/s/${booking.service.slug}`)}
                    className="w-full sm:w-auto"
                  >
                    Book again
                  </Button>
                )}
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="w-full space-y-6">
      <h1 className="text-3xl font-bold">My Bookings</h1>
      {renderContent()}
    </div>
  );
}

