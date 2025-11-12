'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle } from 'lucide-react';
import { formatPrice, getTrustBadge } from '@/lib/utils';

// Define a type for our joined service/provider data
interface ServiceDetails {
  id: string;
  title: string;
  description: string;
  priceInCents: number;
  category: string;
  chargesGst: boolean;
  provider: {
    handle: string;
    businessName: string;
    isVerified: boolean;
    trustLevel: 'bronze' | 'silver' | 'gold' | 'platinum';
    bio: string;
  };
}

export default function ServiceDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const { user, isSignedIn } = useUser();

  const [service, setService] = useState<ServiceDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBooking, setIsBooking] = useState(false);

  useEffect(() => {
    if (slug) {
      fetch(`/api/services/by-slug/${slug}`)
        .then((res) => {
          if (res.status === 404) throw new Error('Service not found');
          if (!res.ok) throw new Error('Failed to fetch service details.');
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
        body: JSON.stringify({ serviceId: service!.id }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to create booking.');
      }

      const newBooking = await res.json();
      alert(`Booking request sent! Your booking ID is ${newBooking.id}.`);
      router.push('/dashboard/bookings');
    } catch (err: any) {
      setError(err.message);
      setIsBooking(false);
    }
  };

  if (isLoading) return <div className="p-8">Loading service...</div>;
  if (error) return <div className="p-8 text-red-500">Error: {error}</div>;
  if (!service) return <div className="p-8">Service not found.</div>;

  const { icon, color } = getTrustBadge(service.provider.trustLevel);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <div className="grid md:grid-cols-3 gap-8">
        {/* Main Content Column */}
        <div className="md:col-span-2">
          {/* --- Service Image (Placeholder) --- */}
          <div className="w-full h-64 bg-gray-200 rounded-lg mb-4 flex items-center justify-center">
            <span className="text-gray-500">Service Image Placeholder</span>
          </div>

          <h1 className="text-3xl font-bold mb-2">{service.title}</h1>
          <Badge variant="outline" className="mb-4 capitalize">{service.category}</Badge>

          <Separator className="my-4" />

          <h2 className="text-xl font-semibold mb-2">About this service</h2>
          <p className="text-gray-700 whitespace-pre-wrap">
            {service.description || 'No description provided.'}
          </p>
        </div>

        {/* Sidebar Column */}
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">{formatPrice(service.priceInCents)}</CardTitle>
              <CardDescription>
                {service.chargesGst ? "Price includes GST (15%)" : "Price excludes GST"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleBookNow} disabled={isBooking} className="w-full">
                {isBooking ? 'Booking...' : 'Book Now'}
              </Button>
              {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            </CardContent>
            <CardFooter>
              <p className="text-xs text-gray-500">
                You won't be charged until the provider accepts your request.
              </p>
            </CardFooter>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg">{service.provider.businessName}</CardTitle>
              <CardDescription>@{service.provider.handle}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col space-y-2">
                {service.provider.isVerified && (
                  <Badge variant="secondary" className="w-fit">
                    <CheckCircle className="h-4 w-4 mr-1 text-green-500" />
                    Verified Provider
                  </Badge>
                )}
                <Badge variant="secondary" className={`w-fit ${color}`}>
                  {icon}
                  {service.provider.trustLevel.charAt(0).toUpperCase() + service.provider.trustLevel.slice(1)} Trust
                </Badge>
              </div>
              <p className="text-sm text-gray-600 mt-4">
                {service.provider.bio || 'No bio provided.'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

