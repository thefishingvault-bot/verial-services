'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterProviderPage() {
  const [businessName, setBusinessName] = useState('');
  const [handle, setHandle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/provider/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName, handle }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to register.');
      }

      // Registration successful! Redirect to the payouts dashboard.
      router.push('/dashboard/payouts');

    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '500px', margin: 'auto' }}>
      <h1>Become a Provider</h1>
      <p>Set up your provider profile to start listing services.</p>
      <form onSubmit={handleSubmit} style={{ marginTop: '1.5rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="businessName">Business Name</label>
          <input
            id="businessName"
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            required
            style={{ width: '100%', padding: '8px', border: '1px solid #ccc' }}
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="handle">Username (Handle)</label>
          <input
            id="handle"
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            required
            placeholder="e.g., 'janes-plumbing'"
            style={{ width: '100%', padding: '8px', border: '1px solid #ccc' }}
          />
          <small>This will be your unique URL: verial.nz/p/{handle}</small>
        </div>
        {error && <p style={{ color: 'red' }}>Error: {error}</p>}
        <button type="submit" disabled={isLoading} style={{ padding: '10px 15px' }}>
          {isLoading ? 'Registering...' : 'Create Provider Account'}
        </button>
      </form>
    </div>
  );
}

