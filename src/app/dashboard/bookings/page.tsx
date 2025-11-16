'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, Package } from 'lucide-react';
import { ReviewForm } from '@/components/reviews/review-form';

// Define a type for our joined booking data
interface CustomerBooking {
  id: string;
  status: 'pending' | 'confirmed' | 'paid' | 'completed' | 'canceled';
  createdAt: string;
  priceAtBooking: number;
  service: { title: string; slug: string };
  provider: { id: string; businessName: string; handle: string; stripeConnectId: string };
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
      return 'default'; // Blue/Default
    case 'confirmed':
      return 'secondary'; // Green (using secondary as a stand-in)
    case 'pending':
      return 'outline'; // Yellow/Outline
    case 'canceled':
      return 'destructive'; // Red
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
        setError(err.message);
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const handlePayNow = (booking: CustomerBooking) => {
    router.push(`/checkout/${booking.id}`);
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
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <Package className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold">No bookings yet</h3>
          <p className="text-muted-foreground">
            When you book a service, it will appear here.
          </p>
        </div>
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
            </CardContent>
            <CardFooter>
              {booking.status === 'confirmed' && (
                <Button onClick={() => handlePayNow(booking)} className="w-full sm:w-auto">
                  Pay Now
                </Button>
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
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8">
      <h1 className="text-3xl font-bold mb-6">My Bookings</h1>
      {renderContent()}
    </div>
  );
}

