"use client";

import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { format } from "date-fns";
import {
  CalendarDays,
  type LucideIcon,
  Clock,
  FileText,
  Heart,
  MessageSquare,
  Search,
  Star,
  Calendar,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, getTrustBadge } from "@/lib/utils";
import { formatBookingPriceLabel, formatServicePriceLabel } from "@/lib/pricing";
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

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-12 flex-col justify-center rounded-md border bg-background px-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold leading-none">{value}</p>
    </div>
  );
}

function SectionHeader({
  title,
  description,
  actionHref,
  actionLabel = "View all",
}: {
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold leading-none">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actionHref ? (
        <Button asChild variant="ghost" size="sm" className="-mr-2 h-8">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}

function TrustLine({ trustLevel, isVerified }: { trustLevel: BookingCardData["providerTrustLevel"]; isVerified: boolean }) {
  const { Icon, color } = getTrustBadge(trustLevel);
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <Icon className={cn("h-3.5 w-3.5", color)} />
        <span className="capitalize">{trustLevel}</span>
      </span>
      {isVerified ? <Badge variant="secondary">Verified</Badge> : null}
    </div>
  );
}

function BookingRow({ booking, variant }: { booking: BookingCardData; variant: "upcoming" | "past" }) {
  const dateLabel =
    variant === "upcoming"
      ? formatDateTime(booking.scheduledAt ?? booking.createdAt)
      : booking.completedAt
        ? formatDateTime(booking.completedAt)
        : "Completed";

  return (
    <div className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0 space-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link
            href={`/dashboard/bookings/${booking.id}`}
            className="min-w-0 flex-1 truncate font-medium hover:underline"
            title={booking.serviceTitle}
          >
            {booking.serviceTitle}
          </Link>
          <StatusBadge status={booking.status} />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            {variant === "upcoming" ? <CalendarDays className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
            {dateLabel}
          </span>
          <span className="font-medium text-foreground">{formatBookingPriceLabel(booking.priceInCents)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs text-muted-foreground">{booking.providerName ?? "Provider"}</span>
          <TrustLine trustLevel={booking.providerTrustLevel} isVerified={booking.providerVerified} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
        {variant === "past" ? (
          <>
            {!booking.hasReview ? (
              <Button asChild size="sm">
                <Link href={`/dashboard/bookings/${booking.id}/review`}>Review Now</Link>
              </Button>
            ) : (
              <Badge variant="secondary" className="h-8 px-3 inline-flex items-center gap-1">
                <Star className="h-3.5 w-3.5" /> Reviewed
              </Badge>
            )}
            <Button asChild size="sm" variant="outline" className="h-8">
              <Link href={`/dashboard/bookings/${booking.id}/receipt`}>
                <FileText className="mr-2 h-4 w-4" /> View Receipt
              </Link>
            </Button>
          </>
        ) : (
          <Button asChild size="sm" variant="outline" className="h-8">
            <Link href={`/dashboard/bookings/${booking.id}`}>View Booking</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function BookingsCard({ upcoming, past }: { upcoming: BookingCardData[]; past: BookingCardData[] }) {
  const nextBooking = upcoming.length > 0 ? upcoming[0] : null;
  const upcomingPreview = useMemo(() => (nextBooking ? upcoming.slice(1, 6) : upcoming.slice(0, 5)), [nextBooking, upcoming]);
  const pastPreview = useMemo(() => past.slice(0, 5), [past]);

  return (
    <Card>
      <CardHeader className="space-y-4">
        <SectionHeader
          title="Bookings"
          description="Upcoming and past bookings in one place."
          actionHref="/dashboard/bookings"
        />

        <div className="rounded-md border bg-muted/30 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Next booking</p>
              {nextBooking ? (
                <>
                  <p className="text-sm text-muted-foreground">{nextBooking.serviceTitle}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(nextBooking.scheduledAt ?? nextBooking.createdAt)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No upcoming bookings right now.</p>
              )}
            </div>
            {nextBooking ? (
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link href={`/dashboard/bookings/${nextBooking.id}`}>View</Link>
              </Button>
            ) : (
              <Button asChild size="sm" variant="link" className="shrink-0 px-0">
                <Link href="/services">Browse Services</Link>
              </Button>
            )}
          </div>
          {nextBooking ? (
            <div className="mt-3 flex items-center justify-between">
              <StatusBadge status={nextBooking.status} />
              <span className="text-sm font-semibold">{formatBookingPriceLabel(nextBooking.priceInCents)}</span>
            </div>
          ) : null}
        </div>

        <Tabs defaultValue="upcoming">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="upcoming" className="flex-1 justify-center sm:flex-none">
              Upcoming ({upcoming.length})
            </TabsTrigger>
            <TabsTrigger value="past" className="flex-1 justify-center sm:flex-none">
              Past ({past.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="mt-4">
            {upcoming.length === 0 ? (
              <div className="rounded-md border border-dashed p-4">
                <p className="text-sm font-medium">No upcoming bookings</p>
                <p className="text-sm text-muted-foreground">Browse services when you're ready.</p>
                <Button asChild size="sm" variant="link" className="mt-2 px-0">
                  <Link href="/services">Browse Services</Link>
                </Button>
              </div>
            ) : upcomingPreview.length === 0 ? (
              <div className="rounded-md border border-dashed p-4">
                <p className="text-sm font-medium">Nothing else upcoming</p>
                <p className="text-sm text-muted-foreground">Your next booking is shown above.</p>
              </div>
            ) : (
              <div className="divide-y rounded-md border">
                {upcomingPreview.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} variant="upcoming" />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="past" className="mt-4">
            {pastPreview.length === 0 ? (
              <div className="rounded-md border border-dashed p-4">
                <p className="text-sm font-medium">No past bookings yet</p>
                <p className="text-sm text-muted-foreground">Your completed bookings will show here.</p>
              </div>
            ) : (
              <div className="divide-y rounded-md border">
                {pastPreview.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} variant="past" />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardHeader>
    </Card>
  );
}

function ReviewReminders({ items }: { items: ReviewPrompt[] }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <SectionHeader title="Review reminders" description="Share feedback on recent bookings." />
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item, index) => (
          <div key={item.bookingId}>
            {index > 0 ? <Separator className="my-3" /> : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.serviceTitle}</p>
                <p className="text-sm text-muted-foreground">
                  {item.providerName ?? "Provider"}  Completed {formatDateTime(item.completedAt ?? null)}
                </p>
              </div>
              <Button asChild size="sm">
                <Link href={item.reviewUrl}>Write review</Link>
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ServiceCardCompact({
  title,
  href,
  imageUrl,
  subtitle,
  priceLabel,
  badges,
  footer,
}: {
  title: string;
  href: string;
  imageUrl: string | null;
  subtitle?: string;
  priceLabel?: string;
  badges?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className="w-full overflow-hidden">
      <div className="relative aspect-video max-h-[170px] w-full bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title}
            fill
            sizes="(min-width: 1024px) 360px, 100vw"
            className="object-cover"
            loading="lazy"
          />
        ) : (
          <Skeleton className="h-full w-full rounded-none" />
        )}
      </div>

      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold leading-snug">
              <Link href={href} className="line-clamp-2 hover:underline">
                {title}
              </Link>
            </CardTitle>
            {subtitle ? <CardDescription className="line-clamp-1">{subtitle}</CardDescription> : null}
          </div>
          {priceLabel ? <div className="shrink-0 text-sm font-semibold">{priceLabel}</div> : null}
        </div>
        {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
      </CardHeader>

      {footer ? <CardFooter className="flex gap-2">{footer}</CardFooter> : null}
    </Card>
  );
}

function FavoritesPreview({ items }: { items: CustomerDashboardData["favoritesPreview"] }) {
  const preview = useMemo(() => items.slice(0, 2), [items]);

  if (preview.length === 0) {
    return (
      <Card>
        <CardHeader>
          <SectionHeader
            title="Favorites"
            description="Save services to find them faster next time."
            actionHref="/dashboard/favorites"
          />
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-dashed p-4">
            <p className="text-sm font-medium">No favorites yet</p>
            <p className="text-sm text-muted-foreground">Tap the heart on any service to save it.</p>
            <Button asChild size="sm" variant="link" className="mt-2 px-0">
              <Link href="/services">Browse Services</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <SectionHeader title="Favorites" description="Your saved services" actionHref="/dashboard/favorites" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {preview.map((fav) => {
            const location = [fav.provider.suburb, fav.provider.region].filter(Boolean).join(", ");
            const ratingLabel = fav.reviewCount > 0 ? `${fav.avgRating.toFixed(1)} (${fav.reviewCount})` : "No reviews";
            const priceLabel = formatServicePriceLabel({ pricingType: fav.pricingType, priceInCents: fav.priceInCents });

            return (
              <ServiceCardCompact
                key={fav.id}
                title={fav.title}
                href={`/s/${fav.slug}`}
                imageUrl={fav.coverImageUrl}
                subtitle={location || undefined}
                priceLabel={priceLabel}
                badges={
                  <>
                    <Badge variant="secondary" className="inline-flex items-center gap-1">
                      <Star className="h-3.5 w-3.5" /> {ratingLabel}
                    </Badge>
                    <Badge variant="outline" className="inline-flex items-center gap-1">
                      <Heart className="h-3.5 w-3.5" /> Saved
                    </Badge>
                  </>
                }
                footer={
                  <>
                    <Button asChild size="sm" variant="outline" className="flex-1">
                      <Link href={`/s/${fav.slug}`}>View</Link>
                    </Button>
                    <Button asChild size="sm" className="flex-1">
                      <Link href={`/s/${fav.slug}#booking`}>Book</Link>
                    </Button>
                  </>
                }
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function Recommendations({ items }: { items: RecommendationCardData[] }) {
  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <SectionHeader title="Recommended for you" description="Based on your favorites and bookings" />
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-dashed p-4">
            <p className="text-sm font-medium">No recommendations yet</p>
            <p className="text-sm text-muted-foreground">Browse services to help us tailor suggestions.</p>
            <Button asChild size="sm" variant="link" className="mt-2 px-0">
              <Link href="/services">Browse Services</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <SectionHeader title="Recommended for you" description="Based on your favorites and bookings" />
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {items.map((rec) => {
          const { Icon, color } = getTrustBadge(rec.provider.trustLevel);
          const priceLabel = formatServicePriceLabel({ pricingType: rec.pricingType, priceInCents: rec.priceInCents });
          return (
            <Card key={rec.serviceId} className="overflow-hidden">
              <div className="relative aspect-video max-h-[170px] w-full bg-muted">
                {rec.coverImageUrl ? (
                  <Image
                    src={rec.coverImageUrl}
                    alt={rec.title}
                    fill
                    sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
                    className="object-cover"
                    loading="lazy"
                  />
                ) : (
                  <Skeleton className="h-full w-full rounded-none" />
                )}
              </div>

              <CardHeader className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-sm font-semibold leading-snug">
                      <Link href={`/s/${rec.slug}`} className="line-clamp-2 hover:underline">
                        {rec.title}
                      </Link>
                    </CardTitle>
                    <CardDescription className="line-clamp-1">{rec.provider.name ?? "Provider"}</CardDescription>
                  </div>
                  <div className="shrink-0 text-sm font-semibold">{priceLabel}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="inline-flex items-center gap-1">
                    <Icon className={cn("h-3.5 w-3.5", color)} />
                    <span className="capitalize">{rec.provider.trustLevel}</span>
                  </Badge>
                  {rec.provider.isVerified ? <Badge variant="secondary">Verified</Badge> : null}
                  {rec.reason ? <Badge variant="secondary">{rec.reason}</Badge> : null}
                </div>
              </CardHeader>

              <CardContent className="text-sm text-muted-foreground">
                <p className="line-clamp-2">{rec.description || "Trusted local service."}</p>
              </CardContent>

              <CardFooter>
                <Button asChild size="sm" className="w-full">
                  <Link href={`/s/${rec.slug}`}>View Service</Link>
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </CardContent>
    </Card>
  );
}

function QuickActions({ unreadNotifications }: { unreadNotifications: number }) {
  type ActionItem = {
    href: string;
    title: string;
    description: string;
    Icon: LucideIcon;
    meta?: ReactNode;
  };

  const items: ActionItem[] = [
    {
      href: "/services",
      title: "Browse Services",
      description: "Find and book a local provider.",
      Icon: Search,
    },
    {
      href: "/dashboard/bookings",
      title: "View Bookings",
      description: "All bookings and receipts.",
      Icon: Calendar,
    },
    {
      href: "/dashboard/messages",
      title: "Messages",
      description: "Chat with providers.",
      Icon: MessageSquare,
      meta:
        unreadNotifications > 0 ? (
          <Badge variant="secondary" className="ml-auto">{unreadNotifications}</Badge>
        ) : null,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Quick actions</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {items.map(({ href, title, Icon, meta }, idx) => {
          const isPrimary = href === "/services";
          const spanClass = idx === 0 ? "col-span-2 md:col-span-1" : "";
          return (
            <Button
              key={href}
              asChild
              variant={isPrimary ? "default" : "outline"}
              className={cn("h-10 justify-start gap-2", spanClass)}
            >
              <Link href={href}>
                <Icon className="h-4 w-4" />
                <span className="font-medium">{title}</span>
                {meta}
              </Link>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export function CustomerDashboardSections({ data }: { data: CustomerDashboardData }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Dashboard</p>
              <h1 className="text-2xl font-semibold leading-tight md:text-3xl">Welcome back, {data.user.name}</h1>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <StatPill label="Active" value={`${data.upcomingBookings.length}`} />
              <StatPill label="Favorites" value={`${data.favorites.length}`} />
              <StatPill label="Unread" value={`${data.unreadNotifications}`} />
            </div>
          </div>
        </CardHeader>
      </Card>

      <section aria-label="Quick actions">
        <QuickActions unreadNotifications={data.unreadNotifications} />
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        <main className="space-y-6 lg:col-span-8">
          <section aria-label="Bookings">
            <BookingsCard upcoming={data.upcomingBookings} past={data.pastBookings} />
          </section>

          <section aria-label="Recommended services">
            <Recommendations items={data.recommendations} />
          </section>
        </main>

        <aside className="space-y-6 lg:col-span-4">
          <section aria-label="Favorites">
            <FavoritesPreview items={data.favoritesPreview} />
          </section>

          <section aria-label="Review reminders">
            <ReviewReminders items={data.reviewsDue} />
          </section>
        </aside>
      </div>
    </div>
  );
}
