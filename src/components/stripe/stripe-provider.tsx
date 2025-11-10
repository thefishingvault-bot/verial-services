'use client';

import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';

// Load Stripe promise outside of component
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

interface StripeProviderProps {
  clientSecret: string;
  children: React.ReactNode;
}

export function StripeProvider({ clientSecret, children }: StripeProviderProps) {
  const options = {
    clientSecret,
    appearance: {
      theme: 'stripe',
      labels: 'floating',
    } as const,
  };

  return (
    <Elements options={options} stripe={stripePromise}>
      {children}
    </Elements>
  );
}

