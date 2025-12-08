'use client';

import { useEffect, useState } from 'react';
import {
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';

export function CheckoutForm() {
  const stripe = useStripe();
  const elements = useElements();

  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const mapStatusToMessage = (status: string | undefined) => {
    switch (status) {
      case 'succeeded':
        return 'Payment succeeded! Redirecting to your bookings...';
      case 'processing':
        return 'Payment processing... we will update your booking shortly.';
      case 'requires_payment_method':
        return 'Payment failed. Please try another payment method.';
      default:
        return null;
    }
  };

  const pollPaymentIntent = async (clientSecret: string) => {
    if (!stripe) return;
    const result = await stripe.retrievePaymentIntent(clientSecret);
    const statusMessage = mapStatusToMessage(result.paymentIntent?.status);
    if (statusMessage) setMessage(statusMessage);

    if (result.paymentIntent?.status === 'succeeded') {
      setTimeout(() => {
        window.location.href = '/dashboard/bookings';
      }, 1200);
    }
  };

  // Surface status if redirected back with PI client secret
  useEffect(() => {
    if (!stripe) return;
    const clientSecret = new URLSearchParams(window.location.search).get('payment_intent_client_secret');
    if (clientSecret) void pollPaymentIntent(clientSecret);
  }, [stripe]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      // Stripe.js has not yet loaded.
      return;
    }

    setIsLoading(true);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        // Make sure to change this to your payment completion page
        return_url: `${window.location.origin}/dashboard/bookings`,
      },
    });

    // This point will only be reached if there is an immediate error
    if (error) {
      if (error.type === "card_error" || error.type === "validation_error") {
        setMessage(error.message || 'An unexpected error occurred.');
      } else {
        setMessage('An unexpected error occurred.');
      }
      setIsLoading(false);
      return;
    }

    const clientSecret = paymentIntent?.client_secret;
    if (clientSecret) {
      await pollPaymentIntent(clientSecret);
    }

    setIsLoading(false);
  };

  return (
    <form id="payment-form" onSubmit={handleSubmit}>
      <PaymentElement id="payment-element" />
      <button disabled={isLoading || !stripe || !elements} id="submit" style={{ padding: '10px 15px', marginTop: '1rem', background: 'blue', color: 'white', width: '100%' }}>
        <span id="button-text">
          {isLoading ? 'Processing...' : 'Pay Now'}
        </span>
      </button>
      {message && <div id="payment-message" style={{ color: 'red', marginTop: '1rem' }}>{message}</div>}
    </form>
  );
}

