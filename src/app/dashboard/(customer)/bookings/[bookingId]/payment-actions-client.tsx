'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { getFinalBookingAmountCents } from '@/lib/booking-price';

export function PaymentActionsClient(props: {
  bookingId: string;
  status: string;
  viewerIsCustomer: boolean;
  pricingType: 'fixed' | 'from' | 'quote';
  providerQuotedPrice: number | null;
  priceAtBooking: number;
}) {
  const { bookingId, status, viewerIsCustomer, providerQuotedPrice, priceAtBooking } = props;
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!viewerIsCustomer) return null;

  const handlePayNow = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/pay`, {
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

  const handleConfirmCompletion = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/confirm-completion`, {
        method: 'POST',
        cache: 'no-store',
      });

      if (!res.ok) throw new Error(await res.text());

      router.refresh();
    } catch (err) {
      setError((err as Error).message ?? 'Failed to confirm completion.');
      setIsLoading(false);
    }
  };

  const finalAmount = getFinalBookingAmountCents({
    providerQuotedPrice,
    priceAtBooking,
  });
  const hasFinalAmount = typeof finalAmount === 'number' && finalAmount > 0;

  return (
    <div className="flex flex-col gap-2">
      {status === 'accepted' && (
        !hasFinalAmount ? (
          <Button variant="outline" disabled>
            Waiting for provider quote
          </Button>
        ) : (
          <Button onClick={handlePayNow} disabled={isLoading}>
            Pay now to confirm
          </Button>
        )
      )}

      {status === 'completed_by_provider' && (
        <Button onClick={handleConfirmCompletion} disabled={isLoading}>
          Confirm completion
        </Button>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
