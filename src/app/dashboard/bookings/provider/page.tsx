'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, Package } from 'lucide-react';

// Define a type for our joined booking data
interface ProviderBooking {
  id: string;
  status: 'pending' | 'confirmed' | 'paid' | 'completed' | 'canceled';
  createdAt: string;
  scheduledDate: string | null;
  priceAtBooking: number;
  service: { title: string };
  user: { firstName: string | null; lastName: string | null; email: string };
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
  status: ProviderBooking['status']
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

export default function ProviderBookingsPage() {
  const [bookings, setBookings] = useState<ProviderBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // Tracks which booking is being updated
  const [error, setError] = useState<string | null>(null);

  const fetchBookings = useCallback(() => {
    setIsLoading(true);
    fetch('/api/provider/bookings/list')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch bookings.');
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

  const handleUpdateStatus = async (bookingId: string, newStatus: ProviderBooking['status']) => {
    setActionLoading(bookingId); // Set loading state for this specific card
    try {
      const res = await fetch('/api/provider/bookings/update-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, newStatus }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to update booking.');
      }

      fetchBookings(); // Refresh the entire list
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update booking.';
      setError(message);
    } finally {
      setActionLoading(null); // Clear loading state
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="ml-2 text-muted-foreground">Loading incoming bookings...</p>
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
            When a customer books one of your services, it will appear here.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {bookings.map((booking) => {
          const isLoadingAction = actionLoading === booking.id;
          return (
            <Card key={booking.id}>
              <CardHeader>
                <CardTitle>{booking.service.title}</CardTitle>
                <CardDescription>
                  Customer: {booking.user.firstName || ''} {booking.user.lastName || ''} ({booking.user.email})
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
              {/* --- NEW: Paid Status --- */}
              {booking.status === 'paid' && (
                <CardFooter className="flex space-x-2">
                  <Button
                    onClick={() => handleUpdateStatus(booking.id, 'completed')}
                    disabled={isLoadingAction}
                    className="w-full sm:w-auto"
                  >
                    {isLoadingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Mark as Complete
                  </Button>
                </CardFooter>
              )}

              {/* --- Pending Status --- */}
              {booking.status === 'pending' && (
                <CardFooter className="flex space-x-2">
                  <Button
                    onClick={() => handleUpdateStatus(booking.id, 'confirmed')}
                    disabled={isLoadingAction}
                    className="w-full sm:w-auto"
                  >
                    {isLoadingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Accept
                  </Button>
                  <Button
                    onClick={() => handleUpdateStatus(booking.id, 'canceled')}
                    disabled={isLoadingAction}
                    variant="destructive"
                    className="w-full sm:w-auto"
                  >
                    {isLoadingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Reject
                  </Button>
                </CardFooter>
              )}
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8">
      <h1 className="text-3xl font-bold mb-6">Manage Bookings</h1>
      {renderContent()}
    </div>
  );
}

