'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Loader2, Sparkles } from 'lucide-react';

interface ServiceBookingPanelProps {
  serviceId: string;
  providerId: string;
  priceInCents: number;
  chargesGst: boolean;
  blockedDays: { from: Date; to: Date }[];
}

export function ServiceBookingPanel({ serviceId, providerId, priceInCents, chargesGst, blockedDays }: ServiceBookingPanelProps) {
  const router = useRouter();
  const { isSignedIn } = useUser();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<string[]>([]);
  const [nextAvailableDate, setNextAvailableDate] = useState<string | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [customerRegion, setCustomerRegion] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isBooking, setIsBooking] = useState(false);

  const formattedPrice = useMemo(() => new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(priceInCents / 100), [priceInCents]);

  const fetchSlots = async (date: Date | undefined) => {
    if (!date) return;
    setIsLoadingSlots(true);
    setSelectedSlot(null);
    setError(null);
    try {
      const res = await fetch('/api/provider/availability/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, date: format(date, 'yyyy-MM-dd') }),
      });
      const data = await res.json();
      setAvailableSlots(data.availableSlots ?? []);
      setBlockedSlots(data.blockedSlots ?? []);
      setNextAvailableDate(data.nextAvailableDate ?? null);
    } catch (err) {
      console.error('[BOOKING_SLOTS]', err);
      setError('Failed to load availability.');
    } finally {
      setIsLoadingSlots(false);
    }
  };

  useEffect(() => {
    fetchSlots(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, providerId]);

  useEffect(() => {
    if (availableSlots.length === 0 && nextAvailableDate && selectedDate) {
      const nextDate = new Date(nextAvailableDate);
      if (nextDate.toDateString() !== selectedDate.toDateString()) {
        setSelectedDate(nextDate);
      }
    }
  }, [availableSlots.length, nextAvailableDate, selectedDate]);

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
          serviceId,
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
      const message = err instanceof Error ? err.message : 'Something went wrong while creating your booking.';
      setError(message);
      setIsBooking(false);
    }
  };

  return (
    <Card className="sticky top-20">
      <CardHeader>
        <CardTitle className="text-2xl">{formattedPrice}</CardTitle>
        <p className="text-sm text-slate-600">{chargesGst ? 'Price includes GST (15%)' : 'Price excludes GST'}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="mb-2 block">Select a date</Label>
          <div className="flex justify-center w-full">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              disabled={[(d) => d < new Date(new Date().setHours(0, 0, 0, 0)), ...blockedDays]}
              className="rounded-md border shadow-sm"
              classNames={{
                head_cell: 'text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]',
                cell: 'h-8 w-8 text-center text-sm p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
                day: 'h-8 w-8 p-0 font-normal aria-selected:opacity-100 hover:bg-accent hover:text-accent-foreground rounded-md',
                day_selected: 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
                day_today: 'bg-accent text-accent-foreground',
                day_outside: 'text-muted-foreground opacity-50',
                day_disabled: 'text-muted-foreground opacity-50',
                day_range_middle: 'aria-selected:bg-accent aria-selected:text-accent-foreground',
                day_hidden: 'invisible',
              }}
            />
          </div>
          {nextAvailableDate && availableSlots.length === 0 && (
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              <Sparkles className="h-4 w-4 text-emerald-500" />
              Next available: {nextAvailableDate}
            </div>
          )}
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
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Provider unavailable for this day.</p>
              {nextAvailableDate && (
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-500" />
                  <button
                    type="button"
                    className="text-primary underline-offset-2 hover:underline"
                    onClick={() => setSelectedDate(new Date(nextAvailableDate))}
                  >
                    Jump to next available ({nextAvailableDate})
                  </button>
                </div>
              )}
            </div>
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
          {blockedSlots.length > 0 && (
            <p className="text-xs text-slate-500 mt-2">Blocked slots are hidden due to provider time-off.</p>
          )}
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

        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      </CardContent>
      <CardFooter>
        <Button type="button" onClick={handleBookNow} disabled={isBooking || !selectedSlot} className="w-full">
          {isBooking ? 'Booking...' : 'Book Now'}
        </Button>
      </CardFooter>
    </Card>
  );
}
