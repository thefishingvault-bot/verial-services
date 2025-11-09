'use client';

import { useState, useEffect } from 'react';

// --- We will install shadcn components next ---
// For now, use basic button and text

interface ConnectDetails {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  stripeConnectId: string | null;
}

export default function PayoutsPage() {
  const [details, setDetails] = useState<ConnectDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/provider/connect/details')
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to fetch provider details. Are you registered as a provider?');
        }
        return res.json();
      })
      .then((data) => {
        setDetails(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, []);

  const handleOnboarding = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/provider/connect/create-link', { method: 'POST' });
      if (!res.ok) {
        throw new Error('Failed to create onboarding link.');
      }
      const { url } = await res.json();
      // Redirect user to Stripe
      window.location.href = url;
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  const renderStatus = () => {
    if (isLoading) return <p>Loading payout details...</p>;
    if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;
    if (!details) return <p>No payout details found.</p>;

    if (!details.stripeConnectId || !details.detailsSubmitted) {
      return (
        <div>
          <h2>Connect your bank account to get paid</h2>
          <p>Verial uses Stripe to manage provider payouts securely. Click below to set up your account.</p>
          <button onClick={handleOnboarding} disabled={isLoading}>
            Start Stripe Onboarding
          </button>
        </div>
      );
    }

    if (details.detailsSubmitted && !details.payoutsEnabled) {
      return (
        <div>
          <h2>Verification Pending</h2>
          <p>Your Stripe account is under review, or you need to submit more information. Click below to manage your account.</p>
          <button onClick={handleOnboarding} disabled={isLoading}>
            Manage Stripe Account
          </button>
          <p style={{ marginTop: '1rem', color: '#555' }}>
            Charges Enabled: {details.chargesEnabled ? 'Yes' : 'No'} <br />
            Payouts Enabled: {details.payoutsEnabled ? 'Yes' : 'No'}
          </p>
        </div>
      );
    }

    return (
      <div>
        <h2>✅ Payouts Active</h2>
        <p>Your Stripe account is fully verified and connected. You are ready to receive payouts.</p>
        <p style={{ marginTop: '1rem', color: '#555' }}>
          Charges Enabled: {details.chargesEnabled ? 'Yes' : 'No'} <br />
          Payouts Enabled: {details.payoutsEnabled ? 'Yes' : 'No'}
        </p>
        <button onClick={handleOnboarding} disabled={isLoading}>
          Manage Stripe Account
        </button>
      </div>
    );
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Provider Payouts</h1>
      <hr style={{ margin: '1rem 0' }} />
      {renderStatus()}
    </div>
  );
}

