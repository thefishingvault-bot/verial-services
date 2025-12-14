'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, Package } from 'lucide-react';
import { ReviewForm } from '@/components/reviews/review-form';

// Define a type for our joined booking data
type CustomerBookingStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'paid'
  | 'completed'
  | 'canceled_customer'
  | 'canceled_provider'
  | 'disputed'
  | 'refunded';

interface CustomerBooking {
  id: string;
  status: CustomerBookingStatus;
  createdAt: string;
  priceAtBooking: number;
  service: { title: string; slug: string };
  provider: {
    id: string;
    businessName: string;
    handle: string;
    stripeConnectId: string;
    baseSuburb: string | null;
    baseRegion: string | null;
    serviceRadiusKm: number | null;
  };
  review: { id: string } | null;
}

// Helper to format currency
const formatPrice = (priceInCents: number) => {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
  }).format(priceInCents / 100);
};

// Helper to get styling for different badge statuses
const getStatusBadgeVariant = (
  status: CustomerBooking['status']
): 'default' | 'secondary' | 'destructive' | 'outline' => {
  switch (status) {
    case 'paid':
    case 'completed':
      return 'default';
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

  const fetchBookings = useCallback(() => {
    setIsLoading(true);
    fetch('/api/bookings/list')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch your bookings.');
        return res.json();
      })
      .then((data) => {
        setBookings(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError((err as Error).message ?? 'Failed to fetch your bookings.');
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchBookings();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [fetchBookings]);

  const handlePayNow = (booking: CustomerBooking) => {
    router.push(`/checkout/${booking.id}`);
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
            <CardHeader>
              <CardTitle>{booking.service.title}</CardTitle>
              <CardDescription>
                Provider: {booking.provider.businessName} (@{booking.provider.handle})
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm font-medium text-muted-foreground">Status</span>
                <Badge variant={getStatusBadgeVariant(booking.status)} className="block w-fit mt-1">
                  {booking.status.toUpperCase()}
                </Badge>
              </div>
              <div>
                <span className="text-sm font-medium text-muted-foreground">Price</span>
                <p className="font-semibold">{formatPrice(booking.priceAtBooking)}</p>
              </div>
              {booking.provider.serviceRadiusKm &&
                (booking.provider.baseSuburb || booking.provider.baseRegion) && (
                  <div className="col-span-2">
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
              <div className="flex flex-wrap gap-2">
              {booking.status === 'pending' && (
                <Button
                  variant="destructive"
                  onClick={() => handleCancel(booking.id)}
                  className="w-full sm:w-auto"
                >
                  Cancel Request
                </Button>
              )}
              {booking.status === 'accepted' && (
                <>
                  <Button onClick={() => handlePayNow(booking)} className="w-full sm:w-auto">
                    Pay Now
                  </Button>
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
              {booking.status === 'completed' && !booking.review && (
                <ReviewForm
                  bookingId={booking.id}
                  serviceTitle={booking.service.title}
                  providerId={booking.provider.id}
                  onReviewSubmit={fetchBookings}
                />
              )}
              {booking.status === 'completed' && booking.review && (
                <Button variant="outline" disabled className="w-full sm:w-auto">
                  Review Submitted
                </Button>
              )}
              </div>
              {booking.status === 'completed' && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handlePayNow(booking)}
                  className="w-full sm:w-auto"
                >
                  Book Again
                </Button>
              )}
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

