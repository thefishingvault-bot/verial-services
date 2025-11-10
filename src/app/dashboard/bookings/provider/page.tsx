'use client';

import { useState, useEffect, useCallback } from 'react';

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

export default function ProviderBookingsPage() {
  const [bookings, setBookings] = useState<ProviderBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBookings = useCallback(() => {
    setIsLoading(true);
    fetch('/api/provider/bookings/list')
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to fetch bookings. Are you a registered provider?');
        }
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

      alert(`Booking ${newStatus}!`);
      fetchBookings(); // Refresh the list
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (isLoading) return <div style={{ padding: '2rem' }}>Loading your bookings...</div>;
  if (error) return <div style={{ padding: '2rem', color: 'red' }}>Error: {error}</div>;
  if (bookings.length === 0) return <div style={{ padding: '2rem' }}>You have no bookings yet.</div>;

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Manage Your Bookings</h1>
      {bookings.map((booking) => (
        <div key={booking.id} style={{ border: '1px solid #ccc', padding: '1rem', margin: '1rem 0', borderRadius: '8px' }}>
          <h3>{booking.service.title}</h3>
          <p>Status: <strong>{booking.status.toUpperCase()}</strong></p>
          <p>Price: <strong>NZD ${(booking.priceAtBooking / 100).toFixed(2)}</strong></p>
          <p>Customer: {booking.user.firstName || ''} {booking.user.lastName || ''} ({booking.user.email})</p>
          <p>Requested: {new Date(booking.createdAt).toLocaleString()}</p>

          {booking.status === 'pending' && (
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => handleUpdateStatus(booking.id, 'confirmed')} style={{ background: 'green', color: 'white' }}>
                Accept
              </button>
              <button onClick={() => handleUpdateStatus(booking.id, 'canceled')} style={{ background: 'red', color: 'white' }}>
                Reject
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

