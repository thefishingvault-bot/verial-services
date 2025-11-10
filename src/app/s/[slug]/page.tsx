'use client'; // This page will fetch data on the client for MVP

import { useState, useEffect } from 'react';
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

// Define a type for our joined service/provider data
interface ServiceDetails {
  id: string;
  title: string;
  description: string;
  priceInCents: number;
  category: string;
  provider: {
    handle: string;
    businessName: string;
    isVerified: boolean;
    trustLevel: string;
    bio: string;
  };
}

export default function ServiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isSignedIn } = useUser();
  const slug = params.slug as string;

  const [service, setService] = useState<ServiceDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBooking, setIsBooking] = useState(false);

  useEffect(() => {
    if (slug) {
      fetch(`/api/services/by-slug/${slug}`)
        .then((res) => {
          if (res.status === 404) {
            throw new Error('Service not found');
          }
          if (!res.ok) {
            throw new Error('Failed to fetch service details.');
          }
          return res.json();
        })
        .then((data) => {
          setService(data);
          setIsLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setIsLoading(false);
        });
    }
  }, [slug]);

  if (isLoading) return <div style={{ padding: '2rem' }}>Loading service...</div>;
  if (error) return <div style={{ padding: '2rem', color: 'red' }}>Error: {error}</div>;
  if (!service) return <div style={{ padding: '2rem' }}>Service not found.</div>;

  const handleBookNow = async () => {
    setIsBooking(true);
    setError(null);

    if (!isSignedIn) {
      router.push(`/sign-in?redirect_url=${window.location.href}`);
      return;
    }

    try {
      const res = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId: service.id }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to create booking.');
      }

      const newBooking = await res.json();
      alert(`Booking request sent! Your booking ID is ${newBooking.id}. You will be notified when the provider accepts.`);
      router.push('/dashboard/bookings'); // Redirect to user's booking list

    } catch (err: any) {
      setError(err.message);
      setIsBooking(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: 'auto' }}>
      <h1>{service.title}</h1>
      <p style={{ fontSize: '1.2rem', color: '#333' }}>
        <strong>NZD ${(service.priceInCents / 100).toFixed(2)}</strong>
      </p>
      <hr style={{ margin: '1rem 0' }} />

      <div style={{ marginBottom: '1rem' }}>
        <h3>About this service</h3>
        <p>{service.description || 'No description provided.'}</p>
      </div>

      <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: '8px' }}>
        <h3>About the provider</h3>
        <strong>{service.provider.businessName}</strong>
        <p>@{service.provider.handle}</p>
        <p>Trust Level: <strong>{service.provider.trustLevel.toUpperCase()}</strong> {service.provider.isVerified ? '✅ Verified' : ''}</p>
        <p>{service.provider.bio || 'No bio provided.'}</p>
      </div>

      <button onClick={handleBookNow} disabled={isBooking} style={{ padding: '10px 15px', marginTop: '2rem' }}>
        {isBooking ? 'Booking...' : 'Book Now'}
      </button>
      {error && <p style={{ color: 'red', marginTop: '1rem' }}>Error: {error}</p>}
    </div>
  );
}

