"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, Loader2 } from "lucide-react";
import { formatPrice, getTrustBadge } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { ContactButton } from "@/components/common/contact-button";
import { FavoriteButton } from "@/components/favorites/favorite-button";

interface ServiceDetails {
  id: string;
  title: string;
  description: string;
  priceInCents: number;
  category: string;
  chargesGst: boolean;
  coverImageUrl: string | null;
  providerId: string;
  provider: {
		userId: string;
    handle: string;
    businessName: string;
    isVerified: boolean;
    trustLevel: 'bronze' | 'silver' | 'gold' | 'platinum';
    bio: string;
		baseSuburb: string | null;
		baseRegion: string | null;
		serviceRadiusKm: number | null;
    user: {
      email: string;
    };
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
  const [blockedDays, setBlockedDays] = useState<{ from: Date; to: Date }[]>([]);
  const [customerRegion, setCustomerRegion] = useState<string>("");
  const [initialIsFavorite, setInitialIsFavorite] = useState<boolean>(false);

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
      .then(async (data: ServiceDetails) => {
        setService(data);

        try {
          const favoritesRes = await fetch("/api/favorites/providers");
          if (favoritesRes.ok) {
            const favoritesData = (await favoritesRes.json()) as {
              favorites: { providerId: string }[];
            };
            const isFav = favoritesData.favorites.some(
              (f) => f.providerId === data.providerId,
            );
            setInitialIsFavorite(isFav);
          }
        } catch (favErr) {
          console.warn("[SERVICE_FAVORITES_LOAD_ERROR]", favErr);
        }
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

  // Fetch blocked dates (time offs) for this provider
  useEffect(() => {
    if (!service?.providerId) return;

    fetch(`/api/public/provider/time-offs?providerId=${service.providerId}`)
      .then((res) => res.json())
      .then((data: { startTime: string; endTime: string }[]) => {
        const ranges = data.map((off) => ({
          from: new Date(off.startTime),
          to: new Date(off.endTime),
        }));
        setBlockedDays(ranges);
      })
      .catch((err) => {
        console.error('[SERVICE_TIME_OFFS]', err);
      });
  }, [service?.providerId]);

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
          customerRegion: customerRegion || undefined,
        }),
      });

      if (!res.ok) {
        let message = 'Failed to create booking.';
        try {
          const data = await res.json();
          if (data?.error === 'OUT_OF_AREA' && data?.message) {
            message = data.message;
          } else if (typeof data === 'string') {
            message = data;
          }
        } catch {
          const errorText = await res.text();
          if (errorText) message = errorText;
        }
        throw new Error(message);
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
          <div className="relative w-full aspect-video bg-gray-200 rounded-lg mb-6 overflow-hidden">
            {service.coverImageUrl ? (
              <Image
                src={service.coverImageUrl}
                alt={service.title}
                fill
                className="object-cover"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <span className="text-gray-500">No Image Provided</span>
              </div>
            )}
          </div>

          <h1 className="text-3xl font-bold mb-2">{service.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Badge variant="outline" className="capitalize">
              {service.category}
            </Badge>
            {service.provider.serviceRadiusKm &&
              (service.provider.baseSuburb || service.provider.baseRegion) && (
                <Badge variant="secondary" className="rounded-full text-xs font-normal">
                  Travels up to {service.provider.serviceRadiusKm} km{' '}
                  {service.provider.baseSuburb
                    ? `from ${service.provider.baseSuburb}`
                    : `in ${service.provider.baseRegion}`}
                </Badge>
              )}
          </div>

          <Separator className="my-4" />

          <h2 className="text-xl font-semibold mb-2">About this service</h2>
          <p className="text-gray-700 whitespace-pre-wrap">
            {service.description || 'No description provided.'}
          </p>

          <Card className="mt-6">
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div className="flex flex-col space-y-1.5">
                <Link href={`/p/${service.provider.handle}`} className="hover:underline">
                  <CardTitle className="text-lg">{service.provider.businessName}</CardTitle>
                  <CardDescription>@{service.provider.handle}</CardDescription>
                </Link>
              </div>
              <div className="flex flex-col items-end gap-2">
                <ContactButton providerUserId={service.provider.userId} />
                {isSignedIn && (
                  <FavoriteButton
                    providerId={service.providerId}
                    initialIsFavorite={initialIsFavorite}
                  />
                )}
              </div>
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
                  <div className="flex justify-center w-full">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      disabled={[
                        (date) => date < new Date(new Date().setHours(0, 0, 0, 0)),
                        ...blockedDays,
                      ]}
                      className="rounded-md border shadow-sm"
                      classNames={{
                        head_cell:
                          "text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]",
                        cell:
                          "h-8 w-8 text-center text-sm p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                        day: "h-8 w-8 p-0 font-normal aria-selected:opacity-100 hover:bg-accent hover:text-accent-foreground rounded-md",
                        day_selected:
                          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                        day_today: "bg-accent text-accent-foreground",
                        day_outside: "text-muted-foreground opacity-50",
                        day_disabled: "text-muted-foreground opacity-50",
                        day_range_middle:
                          "aria-selected:bg-accent aria-selected:text-accent-foreground",
                        day_hidden: "invisible",
                      }}
                    />
                  </div>
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

                <div>
                  <Label className="mb-2 block">Your region</Label>
                  <input
                    type="text"
                    value={customerRegion}
                    onChange={(e) => setCustomerRegion(e.target.value)}
                    placeholder="e.g. Auckland, Waikato, Wellington"
                    className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                  />
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

