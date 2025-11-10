'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// --- We will install Stripe Elements for payment soon ---
// For now, this button will just call our create-intent API

// Define a type for our joined booking data
interface CustomerBooking {
  id: string;
  status: 'pending' | 'confirmed' | 'paid' | 'completed' | 'canceled';
  createdAt: string;
  priceAtBooking: number;
  service: { title: string; slug: string };
  provider: { businessName: string; handle: string; stripeConnectId: string };
}

export default function CustomerBookingsPage() {
  const [bookings, setBookings] = useState<CustomerBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchBookings = useCallback(() => {
    setIsLoading(true);
    fetch('/api/bookings/list')
      .then((res) => res.json())
      .then((data) => {
        setBookings(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError('Failed to fetch bookings.');
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const handlePayNow = async (booking: CustomerBooking) => {
    // --- THIS IS A PLACEHOLDER ---
    // In a real flow, this would open a Stripe payment modal.
    // For now, we will just log to the console and link to a
    // non-existent checkout page.

    alert(`Payment flow for Booking ${booking.id} is not implemented.
    \nAmount: $${(booking.priceAtBooking / 100).toFixed(2)}
    \nProvider Account: ${booking.provider.stripeConnectId}`);

    // router.push(`/checkout/${booking.id}`); // Future step
  };

  if (isLoading) return <div style={{ padding: '2rem' }}>Loading your bookings...</div>;
  if (error) return <div style={{ padding: '2rem', color: 'red' }}>Error: {error}</div>;
  if (bookings.length === 0) return <div style={{ padding: '2rem' }}>You have no bookings yet.</div>;

  return (
    <div style={{ padding: '2rem' }}>
      <h1>My Bookings</h1>
      {bookings.map((booking) => (
        <div key={booking.id} style={{ border: '1px solid #ccc', padding: '1rem', margin: '1rem 0', borderRadius: '8px' }}>
          <h3>{booking.service.title}</h3>
          <p>Provider: <strong>{booking.provider.businessName}</strong></p>
          <p>Status: <strong>{booking.status.toUpperCase()}</strong></p>
          <p>Price: <strong>NZD ${(booking.priceAtBooking / 100).toFixed(2)}</strong></p>

          {booking.status === 'confirmed' && (
            <button onClick={() => handlePayNow(booking)} style={{ background: 'blue', color: 'white', marginTop: '1rem' }}>
              Pay Now
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

