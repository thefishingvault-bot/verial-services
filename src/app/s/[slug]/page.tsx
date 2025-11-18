'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, Loader2 } from 'lucide-react';
import { formatPrice, getTrustBadge } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';

interface ServiceDetails {
  id: string;
  title: string;
  description: string;
  priceInCents: number;
  category: string;
  chargesGst: boolean;
  providerId: string;
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
  const { isSignedIn } = useUser();

  const [service, setService] = useState<ServiceDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [isBooking, setIsBooking] = useState(false);

  useEffect(() => {
    if (!slug) return;

    setIsLoading(true);
    setError(null);

    fetch(`/api/services/by-slug/${slug}`)
      .then((res) => {
        if (res.status === 404) throw new Error('Service not found');
        if (!res.ok) throw new Error('Failed to fetch service details.');
        return res.json();
      })
      .then((data: ServiceDetails) => {
        setService(data);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to load service.';
        setError(message);
        setIsLoading(false);
      });
  }, [slug]);

  useEffect(() => {
    if (!service || !selectedDate) return;

    setIsLoadingSlots(true);
    setSelectedSlot(null);

    fetch('/api/provider/availability/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: service.providerId,
        date: format(selectedDate, 'yyyy-MM-dd'),
      }),
    })
      .then((res) => res.json())
      .then((data: { availableSlots?: string[] }) => {
        setAvailableSlots(data.availableSlots ?? []);
        setIsLoadingSlots(false);
      })
      .catch(() => {
        setError('Failed to load availability.');
        setIsLoadingSlots(false);
      });
  }, [service, selectedDate]);

  const handleBookNow = async () => {
    if (!selectedSlot) {
      setError('Please select an available time slot.');
      return;
    }

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
        body: JSON.stringify({
          serviceId: service!.id,
          scheduledDate: selectedSlot,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to create booking.');
      }

      const newBooking = await res.json();
      alert(`Booking request sent! Your booking ID is ${newBooking.id}.`);
      router.push('/dashboard/bookings');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong while creating your booking.';
      setError(message);
      setIsBooking(false);
    }
  };

  if (isLoading) return <div className="p-8">Loading service...</div>;
  if (error && !service) return <div className="p-8 text-red-500">Error: {error}</div>;
  if (!service) return <div className="p-8">Service not found.</div>;

  const { Icon, color } = getTrustBadge(service.provider.trustLevel);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          <div className="w-full h-64 bg-gray-200 rounded-lg mb-4 flex items-center justify-center">
            <span className="text-gray-500">Service Image Placeholder</span>
          </div>

          <h1 className="text-3xl font-bold mb-2">{service.title}</h1>
          <Badge variant="outline" className="mb-4 capitalize">
            {service.category}
          </Badge>

          <Separator className="my-4" />

          <h2 className="text-xl font-semibold mb-2">About this service</h2>
          <p className="text-gray-700 whitespace-pre-wrap">
            {service.description || 'No description provided.'}
          </p>

          <Card className="mt-6">
            <CardHeader>
              <Link href={`/p/${service.provider.handle}`} className="hover:underline">
                <CardTitle className="text-lg">{service.provider.businessName}</CardTitle>
                <CardDescription>@{service.provider.handle}</CardDescription>
              </Link>
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
                  <Icon className="h-4 w-4 mr-1" />
                  {service.provider.trustLevel.charAt(0).toUpperCase() +
                    service.provider.trustLevel.slice(1)}{' '}
                  Trust
                </Badge>
              </div>
              <p className="text-sm text-gray-600 mt-4">
                {service.provider.bio || 'No bio provided.'}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">{formatPrice(service.priceInCents)}</CardTitle>
              <CardDescription>
                {service.chargesGst ? 'Price includes GST (15%)' : 'Price excludes GST'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label className="mb-2 block">Select a date</Label>
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    disabled={(date) =>
                      date < new Date(new Date().setHours(0, 0, 0, 0))
                    }
                    className="rounded-md border"
                  />
                </div>

                <div>
                  <Label className="mb-2 block">Select a time</Label>
                  {isLoadingSlots && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Loading available slots...</span>
                    </div>
                  )}
                  {!isLoadingSlots && availableSlots.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No available slots on this day.
                    </p>
                  )}
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {availableSlots.map((slot) => (
                      <Button
                        key={slot}
                        type="button"
                        variant={selectedSlot === slot ? 'default' : 'outline'}
                        onClick={() => setSelectedSlot(slot)}
                      >
                        {format(new Date(slot), 'h:mm a')}
                      </Button>
                    ))}
                  </div>
                </div>

                {error && service && (
                  <p className="text-red-500 text-sm mt-2">{error}</p>
                )}

                <Button
                  type="button"
                  onClick={handleBookNow}
                  disabled={isBooking || !selectedSlot}
                  className="w-full"
                >
                  {isBooking ? 'Booking...' : 'Book Now'}
                </Button>
              </div>
            </CardContent>
            <CardFooter>
              <p className="text-xs text-gray-500">
                You won&apos;t be charged until the provider accepts your request.
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}

