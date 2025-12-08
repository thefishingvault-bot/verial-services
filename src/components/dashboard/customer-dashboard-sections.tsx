"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { format } from "date-fns";
import { CalendarDays, Clock, FileText, Heart, Loader2, ShieldCheck, Star, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FavoritesGrid } from "@/components/favorites/favorites-grid";
import { cn, formatPrice, getTrustBadge } from "@/lib/utils";
import type { BookingCardData, CustomerDashboardData, ReviewPrompt } from "@/lib/dashboard/customer-dashboard";
import type { RecommendationCardData } from "@/lib/recommendations";

function formatDateTime(date: string | null) {
  if (!date) return "TBC";
  try {
    return format(new Date(date), "EEE, dd MMM yyyy 'at' h:mmaaa");
  } catch {
    return new Date(date).toLocaleString();
  }
}

function StatusBadge({ status }: { status: BookingCardData["status"] }) {
  const variants: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Pending", variant: "outline" },
    accepted: { label: "Accepted", variant: "secondary" },
    paid: { label: "Paid", variant: "secondary" },
    completed: { label: "Completed", variant: "default" },
    canceled_customer: { label: "Canceled", variant: "destructive" },
    canceled_provider: { label: "Canceled", variant: "destructive" },
    declined: { label: "Declined", variant: "destructive" },
    disputed: { label: "Disputed", variant: "destructive" },
    refunded: { label: "Refunded", variant: "secondary" },
  };
  const { label, variant } = variants[status] ?? { label: status, variant: "secondary" };
  return <Badge variant={variant}>{label}</Badge>;
}

function BookingMeta({ booking }: { booking: BookingCardData }) {
  const { Icon, color } = getTrustBadge(booking.providerTrustLevel);
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
      <span className="flex items-center gap-1">
        <Icon className={cn("h-4 w-4", color)} />
        {booking.providerTrustLevel}
      </span>
      {booking.providerVerified && <Badge variant="secondary">Verified</Badge>}
      {booking.providerHandle && <span>@{booking.providerHandle}</span>}
    </div>
  );
}

function UpcomingBookings({ items }: { items: BookingCardData[] }) {
  const [bookings, setBookings] = useState(items);
  const [isPending, startTransition] = useTransition();

  const handleCancel = (bookingId: string) => {
    startTransition(async () => {
      let previous: BookingCardData[] = [];
      setBookings((prev) => {
        previous = prev;
        return prev.filter((b) => b.id !== bookingId);
      });
      const res = await fetch("/api/bookings/cancel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      if (!res.ok) {
        // rollback on failure
        setBookings(previous);
      }
    });
  };

  if (bookings.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>Upcoming bookings</CardTitle>
          <CardDescription>You have no upcoming bookings.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {bookings.map((booking) => (
        <Card key={booking.id} className="border shadow-sm">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">{booking.serviceTitle}</CardTitle>
              <CardDescription className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                {booking.providerName ?? "Provider"}
              </CardDescription>
              <BookingMeta booking={booking} />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              <span>{formatDateTime(booking.scheduledAt ?? booking.createdAt)}</span>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <StatusBadge status={booking.status} />
              <span>{formatPrice(booking.priceInCents)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/dashboard/bookings/${booking.id}`}>
                <Button variant="outline" size="sm">View Booking</Button>
              </Link>
              {booking.canCancel && (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={isPending}
                  onClick={() => handleCancel(booking.id)}
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                  <span className="ml-1">Cancel booking</span>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PastBookings({ items }: { items: BookingCardData[] }) {
  if (items.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>Past bookings</CardTitle>
          <CardDescription>No past bookings yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((booking) => (
        <Card key={booking.id} className="border shadow-sm">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">{booking.serviceTitle}</CardTitle>
              <CardDescription>{booking.providerName ?? "Provider"}</CardDescription>
              <BookingMeta booking={booking} />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>{booking.completedAt ? formatDateTime(booking.completedAt) : "Completed"}</span>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <StatusBadge status={booking.status} />
              <span>{formatPrice(booking.priceInCents)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {!booking.hasReview ? (
                <Link href={`/dashboard/bookings/${booking.id}/review`}>
                  <Button size="sm">Review Now</Button>
                </Link>
              ) : (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Star className="h-4 w-4" /> Reviewed
                </Badge>
              )}
              <Link href={`/dashboard/bookings/${booking.id}/receipt`}>
                <Button size="sm" variant="outline">
                  <FileText className="mr-2 h-4 w-4" /> View Receipt
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ReviewReminders({ items }: { items: ReviewPrompt[] }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review reminders</CardTitle>
        <CardDescription>Share feedback on recent bookings.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        {items.map((item) => (
          <Card key={item.bookingId} className="border shadow-sm">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base">{item.serviceTitle}</CardTitle>
              <CardDescription>{item.providerName ?? "Provider"}</CardDescription>
              <p className="text-sm text-muted-foreground">Completed {formatDateTime(item.completedAt ?? null)}</p>
            </CardHeader>
            <CardFooter>
              <Link href={item.reviewUrl} className="w-full">
                <Button className="w-full" size="sm">Write review</Button>
              </Link>
            </CardFooter>
          </Card>
        ))}
      </CardContent>
    </Card>
  );
}

function FavoritesPreview({ items }: { items: CustomerDashboardData["favoritesPreview"] }) {
  if (items.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Favorites</CardTitle>
            <CardDescription>Services you love will appear here.</CardDescription>
          </div>
          <Link href="/dashboard/favorites" className="text-sm font-medium text-primary">View all</Link>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No favorites yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Favorites</CardTitle>
          <CardDescription>Your top picks</CardDescription>
        </div>
        <Link href="/dashboard/favorites" className="text-sm font-medium text-primary">View all</Link>
      </CardHeader>
      <CardContent>
        <FavoritesGrid items={items} sort="recent" />
      </CardContent>
    </Card>
  );
}

function Recommendations({ items }: { items: RecommendationCardData[] }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Recommended for you</CardTitle>
          <CardDescription>Based on your favorites and bookings</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((rec) => {
          const { Icon, color } = getTrustBadge(rec.provider.trustLevel);
          return (
            <Card key={rec.serviceId} className="border shadow-sm">
              <CardHeader className="space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      <Link href={`/s/${rec.slug}`} className="hover:text-emerald-600">
                        {rec.title}
                      </Link>
                    </CardTitle>
                    <CardDescription>{rec.provider.name ?? "Provider"}</CardDescription>
                  </div>
                  <Heart className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon className={cn("h-4 w-4", color)} />
                  {rec.provider.trustLevel}
                  {rec.provider.isVerified && <Badge variant="secondary">Verified</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p className="line-clamp-2">{rec.description || "Trusted local service."}</p>
                <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                  <span>{formatPrice(rec.priceInCents)}</span>
                  {rec.reason && <span className="text-xs text-muted-foreground">{rec.reason}</span>}
                </div>
              </CardContent>
              <CardFooter>
                <Link href={`/s/${rec.slug}`} className="w-full">
                  <Button className="w-full" size="sm">View service</Button>
                </Link>
              </CardFooter>
            </Card>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function CustomerDashboardSections({ data }: { data: CustomerDashboardData }) {
  return (
    <div className="space-y-8">
      <section className="space-y-4" aria-label="Bookings">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <CalendarDays className="h-4 w-4" /> Upcoming bookings
            </div>
            <UpcomingBookings items={data.upcomingBookings} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Clock className="h-4 w-4" /> Past bookings
            </div>
            <PastBookings items={data.pastBookings} />
          </div>
        </div>
      </section>

      <section aria-label="Review reminders">
        <ReviewReminders items={data.reviewsDue} />
      </section>

      <section aria-label="Favorites preview">
        <FavoritesPreview items={data.favoritesPreview} />
      </section>

      <section aria-label="Recommended services">
        <Recommendations items={data.recommendations} />
      </section>
    </div>
  );
}
