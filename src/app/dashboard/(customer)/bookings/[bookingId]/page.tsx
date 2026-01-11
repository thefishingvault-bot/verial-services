import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { db } from "@/lib/db";
import { bookings, bookingCancellations, bookingReschedules, providers, reviews } from "@/db/schema";
import { formatPrice } from "@/lib/utils";
import { getBookingStatusLabel, getBookingStatusVariant } from "@/lib/bookings/status";
import { BookingTimeline, TimelineEvent } from "@/components/bookings/booking-timeline";
import { stripe } from "@/lib/stripe";
import { ShieldCheck, CalendarClock, CreditCard, CheckCircle2, MessageCircle } from "lucide-react";
import { CancelBookingButton } from "@/components/bookings/cancel-booking-button";
import { RequestRescheduleButton } from "@/components/bookings/request-reschedule-button";
import { RescheduleResponseCard } from "@/components/bookings/reschedule-response-card";
import { CustomerRescheduleResponseCard } from "@/components/bookings/customer-reschedule-response-card";
import { PaymentSyncClient } from "./payment-sync-client";
import { PaymentActionsClient } from "./payment-actions-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BookingEventType =
  | "requested"
  | "accepted"
  | "payment_intent_created"
  | "paid"
  | "completed"
  | "cancelled"
  | "reviewed"
  | "reschedule_requested"
  | "reschedule_approved"
  | "reschedule_declined"
  | "refund"
  | "disputed";

type PaymentIntentWithCharges = Stripe.PaymentIntent & {
  charges?: {
    data?: Array<Stripe.Charge & { refunds?: { data?: Stripe.Refund[] } }>;
  };
};

type LoadedBooking = {
  booking: {
    id: string;
    status: (typeof bookings.$inferSelect)["status"];
    userId: string;
    providerId: string;
    scheduledDate: Date | null;
    priceAtBooking: number;
    providerQuotedPrice: number | null;
    providerMessage: string | null;
    providerDeclineReason: string | null;
    providerCancelReason: string | null;
    paymentIntentId: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  service: {
    id: string;
    title: string;
    slug: string;
    pricingType: "fixed" | "from" | "quote";
  };
  provider: {
    id: string;
    businessName: string;
    handle: string;
    isVerified: boolean;
    chargesGst: boolean;
    user?: { firstName: string | null; lastName: string | null; email: string | null } | null;
  };
  customer: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
  review: { id: string; createdAt: Date } | null;
  paymentIntent: PaymentIntentWithCharges | null;
  timeline: TimelineEvent<BookingEventType>[];
  reschedules: {
    id: string;
    status: "pending" | "approved" | "declined";
    proposedDate: Date;
    customerNote: string | null;
    providerNote: string | null;
    requesterId: string;
    responderId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }[];
  viewerIsProvider: boolean;
  viewerIsCustomer: boolean;
  cancellation: {
    actor: "customer" | "provider";
    reason: string | null;
    createdAt: Date;
  } | null;
};

function formatDateLabel(date: Date | null) {
  if (!date) return "Not scheduled";
  return date.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildTimeline(
  booking: LoadedBooking["booking"],
  review: { id: string; createdAt: Date } | null,
  paymentIntent: PaymentIntentWithCharges | null,
  cancellation: LoadedBooking["cancellation"],
  reschedules: LoadedBooking["reschedules"],
): TimelineEvent<BookingEventType>[] {
  const events: TimelineEvent<BookingEventType>[] = [];

  events.push({
    type: "requested",
    label: "Booking requested",
    timestamp: booking.createdAt,
  });

  if (booking.status === "accepted" || booking.status === "paid" || booking.status === "completed") {
    events.push({
      type: "accepted",
      label: "Accepted by provider",
      timestamp: booking.updatedAt ?? booking.createdAt,
    });
  }

  if (booking.paymentIntentId) {
    events.push({
      type: "payment_intent_created",
      label: "Payment intent created",
      timestamp: paymentIntent?.created ? new Date(paymentIntent.created * 1000) : booking.updatedAt ?? booking.createdAt,
    });
  }

  if (["paid", "completed", "refunded", "disputed"].includes(booking.status)) {
    const firstCharge = (paymentIntent as PaymentIntentWithCharges | null)?.charges?.data?.[0];
    events.push({
      type: "paid",
      label: "Payment successful",
      timestamp: paymentIntent?.status === "succeeded" && firstCharge?.created
        ? new Date(firstCharge.created * 1000)
        : booking.updatedAt ?? booking.createdAt,
    });
  }

  if (booking.status === "completed") {
    events.push({
      type: "completed",
      label: "Completed",
      timestamp: booking.updatedAt ?? booking.createdAt,
    });
  }

  if (cancellation || booking.status === "canceled_customer" || booking.status === "canceled_provider") {
    events.push({
      type: "cancelled",
      label: cancellation
        ? `Cancelled by ${cancellation.actor}`
        : booking.status === "canceled_provider"
          ? "Cancelled by provider"
          : "Cancelled by customer",
      timestamp: cancellation?.createdAt ?? booking.updatedAt ?? booking.createdAt,
    });
  }

  const refundTimestamp = getRefundTimestamp(paymentIntent);
  if (refundTimestamp) {
    events.push({
      type: "refund",
      label: "Payment refunded",
      timestamp: refundTimestamp,
    });
  }

  if (booking.status === "disputed") {
    events.push({
      type: "disputed",
      label: "Payment disputed",
      timestamp: paymentIntent?.created ? new Date(paymentIntent.created * 1000) : booking.updatedAt ?? booking.createdAt,
    });
  }

  if (review) {
    events.push({
      type: "reviewed",
      label: "Reviewed",
      timestamp: review.createdAt,
    });
  }

  reschedules.forEach((reschedule) => {
    events.push({
      type: "reschedule_requested",
      label: `Reschedule requested (${formatDateLabel(reschedule.proposedDate)})`,
      timestamp: reschedule.createdAt,
    });

    if (reschedule.status === "approved") {
      events.push({
        type: "reschedule_approved",
        label: "Reschedule approved",
        timestamp: reschedule.updatedAt,
      });
    }

    if (reschedule.status === "declined") {
      events.push({
        type: "reschedule_declined",
        label: "Reschedule declined",
        timestamp: reschedule.updatedAt,
      });
    }
  });

  return events
    .filter((event) => !!event.timestamp)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function getRefundTimestamp(paymentIntent: PaymentIntentWithCharges | null): Date | null {
  const charges = (paymentIntent as PaymentIntentWithCharges | null)?.charges?.data ?? [];
  if (!charges.length) return null;
  for (const charge of charges) {
    const refund = charge.refunds?.data?.[0];
    if (refund?.created) return new Date(refund.created * 1000);
    if (charge.refunded && charge.created) return new Date(charge.created * 1000);
  }
  return null;
}

async function loadBooking(
  bookingId: string,
  userId: string,
): Promise<LoadedBooking | { error: "unauthorized" | "not_found" }> {
  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    columns: {
      id: true,
      status: true,
      userId: true,
      providerId: true,
      scheduledDate: true,
      priceAtBooking: true,
      providerQuotedPrice: true,
      providerMessage: true,
      providerDeclineReason: true,
      providerCancelReason: true,
      paymentIntentId: true,
      createdAt: true,
      updatedAt: true,
    },
    with: {
      service: {
        columns: { id: true, title: true, slug: true, pricingType: true },
      },
      provider: {
        columns: { id: true, businessName: true, handle: true, isVerified: true, chargesGst: true },
        with: {
          user: { columns: { firstName: true, lastName: true, email: true } },
        },
      },
      user: {
        columns: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });

  if (!booking) return { error: "not_found" };

  const viewerProvider = await db.query.providers.findFirst({
    where: eq(providers.userId, userId),
    columns: { id: true },
  });

  const viewerIsCustomer = booking.userId === userId;
  const viewerIsProvider = !!viewerProvider && booking.providerId === viewerProvider.id;

  if (!viewerIsCustomer && !viewerIsProvider) {
    return { error: "unauthorized" };
  }

  const review = await db.query.reviews.findFirst({
    where: and(eq(reviews.bookingId, booking.id)),
    columns: { id: true, createdAt: true },
  });

  const cancellation = await db.query.bookingCancellations.findFirst({
    where: eq(bookingCancellations.bookingId, booking.id),
    orderBy: [desc(bookingCancellations.createdAt)],
    columns: { actor: true, reason: true, createdAt: true },
  });

  const reschedules = await db.query.bookingReschedules.findMany({
    where: eq(bookingReschedules.bookingId, booking.id),
    columns: {
      id: true,
      status: true,
      proposedDate: true,
      customerNote: true,
      providerNote: true,
      requesterId: true,
      responderId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [desc(bookingReschedules.createdAt)],
  });

  const typedReschedules: LoadedBooking["reschedules"] = reschedules
    .filter((reschedule) => ["pending", "approved", "declined"].includes(reschedule.status as string))
    .map((reschedule) => ({
      ...reschedule,
      status: reschedule.status as "pending" | "approved" | "declined",
    }));

  let paymentIntent: PaymentIntentWithCharges | null = null;
  if (booking.paymentIntentId) {
    try {
      paymentIntent = (await stripe.paymentIntents.retrieve(booking.paymentIntentId, {
        expand: ["charges.data.refunds"],
      })) as PaymentIntentWithCharges;
    } catch (_err) {
      paymentIntent = null;
    }
  }

  const typedCancellation: LoadedBooking["cancellation"] =
    cancellation && (cancellation.actor === "customer" || cancellation.actor === "provider")
      ? { ...cancellation, actor: cancellation.actor as "customer" | "provider" }
      : null;

  const timeline = buildTimeline(booking, (review ?? null) as { id: string; createdAt: Date } | null, paymentIntent, typedCancellation, typedReschedules);

  return {
    booking,
    service: booking.service,
    provider: {
      id: booking.provider.id,
      businessName: booking.provider.businessName,
      handle: booking.provider.handle,
      isVerified: booking.provider.isVerified,
      chargesGst: booking.provider.chargesGst,
      user: booking.provider.user,
    },
    customer: booking.user,
    review: review ?? null,
    paymentIntent,
    timeline,
    reschedules: typedReschedules,
    viewerIsProvider,
    viewerIsCustomer,
    cancellation: typedCancellation,
  };
}

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Unauthorized</CardTitle>
            <CardDescription>Please sign in to view this booking.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { bookingId } = await params;
  const result = await loadBooking(bookingId, userId);

  if ("error" in result) {
    if (result.error === "not_found") {
      return (
        <div className="mx-auto max-w-3xl px-4 py-10">
          <Card>
            <CardHeader>
              <CardTitle>Booking not found</CardTitle>
              <CardDescription>The booking you are looking for does not exist.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Unauthorized</CardTitle>
            <CardDescription>You do not have access to this booking.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { booking, service, provider, customer, review, paymentIntent, timeline, viewerIsProvider, reschedules, viewerIsCustomer } = result;

  const pendingReschedule = reschedules.find((reschedule) => reschedule.status === "pending") || null;
  const pendingRequestedByProvider = !!pendingReschedule && pendingReschedule.requesterId !== booking.userId;
  const showReviewCta = booking.status === "completed" && !review && !viewerIsProvider;
  const showCancel = ["pending", "accepted"].includes(booking.status);
  const canRequestReschedule = viewerIsCustomer && ["accepted", "paid"].includes(booking.status) && !pendingReschedule;
  const showReceipt = ["paid", "refunded", "completed"].includes(booking.status);
  const showInvoice = showReceipt && provider.chargesGst;
  const paymentStatus = paymentIntent?.status ?? "not_created";
  const paymentStatusLabel = (() => {
    if (!paymentIntent) return "Not created";
    switch (paymentIntent.status) {
      case "succeeded":
        return "Succeeded";
      case "requires_payment_method":
        return "Requires payment method";
      case "requires_confirmation":
      case "requires_action":
        return "Awaiting confirmation";
      case "processing":
        return "Processing";
      case "canceled":
        return "Canceled";
      default:
        return paymentIntent.status;
    }
  })();
  const paymentTone = paymentStatus === "succeeded"
    ? "text-emerald-600"
    : paymentStatus === "requires_payment_method" || paymentStatus === "canceled"
      ? "text-destructive"
      : "text-muted-foreground";

  const providerReason = booking.providerDeclineReason || booking.providerCancelReason;
  const showProviderNote = Boolean(providerReason || booking.providerMessage);

  const shouldSyncPayment =
    viewerIsCustomer &&
    booking.status !== "paid" &&
    booking.paymentIntentId != null &&
    paymentIntent?.status === "succeeded";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={getBookingStatusVariant(booking.status)} className="text-sm uppercase tracking-tight">
            {getBookingStatusLabel(booking.status)}
          </Badge>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarClock className="h-4 w-4" />
            <span>{formatDateLabel(booking.scheduledDate)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CreditCard className="h-4 w-4" />
            <span>{formatPrice(booking.priceAtBooking)}</span>
          </div>
        </div>
        {booking.providerQuotedPrice != null && (
          <p className="text-sm text-muted-foreground">
            Quote accepted at {formatPrice(booking.providerQuotedPrice)}
          </p>
        )}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{service.title}</h1>
          <p className="text-muted-foreground">Booking {booking.id}</p>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Timeline</CardTitle>
            <CardDescription>Key events for this booking.</CardDescription>
          </CardHeader>
          <CardContent>
            <BookingTimeline events={timeline} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Provider</CardTitle>
              <CardDescription>Service owner</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback>{provider.businessName.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Link href={`/p/${provider.handle}`} className="font-semibold hover:underline">
                    {provider.businessName}
                  </Link>
                  {provider.isVerified && (
                    <span className="flex items-center gap-1 text-xs text-emerald-600">
                      <ShieldCheck className="h-4 w-4" />
                      Verified
                    </span>
                  )}
                </div>
                {provider.user?.email && <p className="text-sm text-muted-foreground">{provider.user.email}</p>}
                <Link href={`/s/${service.slug}`} className="text-sm text-primary hover:underline">
                  View service page
                </Link>
              </div>
            </CardContent>
          </Card>

          {viewerIsProvider && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Customer</CardTitle>
                <CardDescription>Who booked</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback>
                    {`${customer.firstName?.[0] ?? "C"}${customer.lastName?.[0] ?? ""}`.toUpperCase() || "CU"}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <p className="font-semibold">
                    {[customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Customer"}
                  </p>
                  {customer.email && <p className="text-sm text-muted-foreground">{customer.email}</p>}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {shouldSyncPayment && <PaymentSyncClient bookingId={booking.id} shouldSync={shouldSyncPayment} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Actions</CardTitle>
          <CardDescription>Manage this booking</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {showCancel && <CancelBookingButton bookingId={booking.id} disabled={!showCancel} />}
          <PaymentActionsClient
            bookingId={booking.id}
            status={booking.status}
            viewerIsCustomer={viewerIsCustomer}
            pricingType={service.pricingType}
            providerQuotedPrice={booking.providerQuotedPrice}
            priceAtBooking={booking.priceAtBooking}
          />
          {viewerIsCustomer && (
            <Link href={`/dashboard/messages/${booking.id}`}>
              <Button variant="secondary">
                <MessageCircle className="mr-2 h-4 w-4" /> Message provider
              </Button>
            </Link>
          )}
          {viewerIsCustomer && (
            <RequestRescheduleButton bookingId={booking.id} disabled={!canRequestReschedule} />
          )}
          {pendingReschedule && (
            <Badge variant="outline" className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" /> Reschedule pending
            </Badge>
          )}
          {showReceipt && (
            <Link href={`/dashboard/bookings/${booking.id}/receipt`}>
              <Button variant="secondary">
                <CreditCard className="mr-2 h-4 w-4" /> View receipt
              </Button>
            </Link>
          )}
          {showInvoice && (
            <Link href={`/dashboard/bookings/${booking.id}/invoice`}>
              <Button variant="secondary">
                <CreditCard className="mr-2 h-4 w-4" /> View invoice
              </Button>
            </Link>
          )}
          {showReviewCta && (
            <Link href={`/dashboard/bookings/${booking.id}/review`}>
              <Button>
                <MessageCircle className="mr-2 h-4 w-4" /> Leave a review
              </Button>
            </Link>
          )}
          {!showReviewCta && review && (
            <Button variant="outline" disabled>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Review submitted
            </Button>
          )}
        </CardContent>
      </Card>

      {viewerIsProvider && pendingReschedule && (
        <RescheduleResponseCard bookingId={booking.id} reschedule={pendingReschedule} />
      )}

      {viewerIsCustomer && pendingReschedule && pendingRequestedByProvider && (
        <CustomerRescheduleResponseCard bookingId={booking.id} reschedule={pendingReschedule} />
      )}

      {showProviderNote && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Provider message</CardTitle>
            <CardDescription>Notes from the provider about your booking.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {providerReason && (
              <p>
                <span className="font-semibold">Reason:</span> {providerReason}
              </p>
            )}
            {booking.providerMessage && (
              <p className="whitespace-pre-wrap text-muted-foreground">{booking.providerMessage}</p>
            )}
          </CardContent>
        </Card>
      )}

      {(process.env.NODE_ENV !== "production" || process.env.SHOW_PAYMENT_DEBUG === "true") && (
        <>
          <Separator />

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Payment</CardTitle>
              <CardDescription>Intent status and identifiers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center justify-between text-xs uppercase tracking-tight text-foreground">
                <span className="font-semibold">Status</span>
                <span className={paymentTone}>{paymentStatusLabel}</span>
              </div>
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                <span>Payment intent: {booking.paymentIntentId ?? "Not created"}</span>
              </div>
              {paymentIntent && (
                <div className="flex flex-col gap-1 pl-6">
                  <span>Status: {paymentIntent.status}</span>
                  <span>Amount: {formatPrice(paymentIntent.amount)}</span>
                  <span>Created: {new Date(paymentIntent.created * 1000).toLocaleString()}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

