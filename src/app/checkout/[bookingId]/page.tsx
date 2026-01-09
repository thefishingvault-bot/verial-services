'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { StripeProvider } from '@/components/stripe/stripe-provider';
import { CheckoutForm } from '@/components/forms/checkout-form';

interface BookingDetails {
  bookingId: string;
  amount: number;
  providerStripeId: string;
}

export default function CheckoutPage() {
  const params = useParams();
  const bookingId = params.bookingId as string;

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [bookingDetails, setBookingDetails] = useState<BookingDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Fetch booking details (price, provider ID)
  useEffect(() => {
    if (!bookingId) return;

    fetch(`/api/bookings/details/${bookingId}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to fetch booking details. Invalid booking or not authorized.');
        }
        return res.json();
      })
      .then((data) => {
        setBookingDetails(data);
      })
      .catch((err) => setError(err.message));
  }, [bookingId]);

  // Step 2: Create Payment Intent once we have booking details
  useEffect(() => {
    if (bookingDetails) {
      fetch('/api/stripe/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: bookingDetails.amount,
          bookingId: bookingDetails.bookingId,
          providerStripeId: bookingDetails.providerStripeId,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.clientSecret) {
            setClientSecret(data.clientSecret);
          } else {
            throw new Error('Failed to create payment intent.');
          }
        })
        .catch((err) => setError(err.message));
    }
  }, [bookingDetails]);

  const renderContent = () => {
    if (error) {
      return <div className="text-red-600">Error: {error}</div>;
    }
    if (!clientSecret || !bookingDetails) {
      return <div className="text-sm text-muted-foreground">Loading payment details...</div>;
    }
    return (
      <StripeProvider clientSecret={clientSecret}>
        <CheckoutForm bookingId={bookingId} />
      </StripeProvider>
    );
  };

  return (
    <div className="min-h-screen bg-white px-4 py-10">
      <div className="mx-auto w-full max-w-xl space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-gray-900">Complete Your Payment</h1>
          <p className="text-sm text-gray-600">
            You are paying <strong>NZD ${((bookingDetails?.amount ?? 0) / 100).toFixed(2)}</strong>
            <br />
            Booking ID: {bookingId}
          </p>
        </div>
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

