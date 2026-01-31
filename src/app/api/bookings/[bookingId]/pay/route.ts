import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { bookings, providers, services } from "@/db/schema";
import { normalizeStatus } from "@/lib/booking-state";
import { getFinalBookingAmountCents } from "@/lib/booking-price";
import { calculateBookingPaymentBreakdown, getMinimumBookingAmountCents } from "@/lib/payments/fees";

export const runtime = "nodejs";

function getSiteUrl(req: Request): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (explicit && explicit.trim()) return explicit.trim().replace(/\/$/, "");

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  try {
    return new URL(req.url).origin;
  } catch {
    return "http://localhost:3000";
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { bookingId } = await params;
  if (!bookingId) {
    return new NextResponse("Missing bookingId", { status: 400 });
  }

  const booking = await db.query.bookings.findFirst({
    where: and(eq(bookings.id, bookingId), eq(bookings.userId, userId)),
    columns: {
      id: true,
      status: true,
      priceAtBooking: true,
      providerId: true,
      serviceId: true,
      providerQuotedPrice: true,
    },
  });

  if (!booking) {
    return new NextResponse("Booking not found or access denied", { status: 404 });
  }

  const normalizedStatus = normalizeStatus(booking.status);
  if (normalizedStatus !== "accepted") {
    return new NextResponse(`Cannot pay for booking with status: ${booking.status}`, { status: 400 });
  }

  const service = await db.query.services.findFirst({
    where: eq(services.id, booking.serviceId),
    columns: { title: true, pricingType: true },
  });

  // Quote-priced services must have an explicit provider quote before the customer can pay.
  if (service?.pricingType === "quote" && !booking.providerQuotedPrice) {
    return new NextResponse("Waiting for provider quote", { status: 400 });
  }

  const amount = getFinalBookingAmountCents({
    providerQuotedPrice: booking.providerQuotedPrice,
    priceAtBooking: booking.priceAtBooking,
  });

  if (!amount) {
    return new NextResponse("Waiting for provider quote", { status: 400 });
  }

  const minBookingAmountCents = getMinimumBookingAmountCents();
  if (amount < minBookingAmountCents) {
    return new NextResponse(
      `Amount must be at least $${(minBookingAmountCents / 100).toFixed(2)} NZD`,
      { status: 400 },
    );
  }

  const breakdown = calculateBookingPaymentBreakdown({ bookingBaseAmountCents: amount });

  const provider = await db.query.providers.findFirst({
    where: eq(providers.id, booking.providerId),
    columns: { id: true, stripeConnectId: true },
  });

  if (!provider?.stripeConnectId) {
    return new NextResponse("Provider is not configured for Stripe Connect", { status: 400 });
  }

  const siteUrl = getSiteUrl(req);

  // Platform charge ONLY (separate charges and transfers): no transfer_data.destination and no application_fee_amount.
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "nzd",
          unit_amount: breakdown.totalChargeCents,
          product_data: {
            name: service?.title ? `Booking: ${service.title}` : `Booking ${booking.id}`,
          },
        },
      },
    ],
    success_url: `${siteUrl}/dashboard/bookings?success=1&bookingId=${encodeURIComponent(booking.id)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/dashboard/bookings/${encodeURIComponent(booking.id)}`,
    payment_intent_data: {
      metadata: {
        bookingId: booking.id,
        userId,
        providerId: provider.id,
        bookingBaseAmountCents: String(breakdown.bookingBaseAmountCents),
        customerServiceFeeCents: String(breakdown.customerServiceFeeCents),
        totalChargeCents: String(breakdown.totalChargeCents),
      },
      transfer_group: booking.id,
    },
    metadata: {
      bookingId: booking.id,
      userId,
      providerId: provider.id,
      bookingBaseAmountCents: String(breakdown.bookingBaseAmountCents),
      customerServiceFeeCents: String(breakdown.customerServiceFeeCents),
      totalChargeCents: String(breakdown.totalChargeCents),
    },
  });

  if (!session.url) {
    return new NextResponse("Stripe session missing URL", { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
