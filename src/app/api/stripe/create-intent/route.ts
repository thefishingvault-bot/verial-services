import { stripe } from "@/lib/stripe";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookings, providers, services } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { normalizeStatus } from "@/lib/booking-state";
import { getFinalBookingAmountCents } from "@/lib/booking-price";
import { calculateBookingPaymentBreakdown } from "@/lib/payments/fees";
import { calculateEarnings } from "@/lib/earnings";
import { getPlatformFeeBpsForPlan, normalizeProviderPlan } from "@/lib/provider-subscription";

// This route is for creating a Payment Intent for a *platform* charge.
// This will be adapted later for Connect (destination charges).

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { bookingId } = await req.json();

    if (!bookingId) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    const booking = await db.query.bookings.findFirst({
      where: and(eq(bookings.id, bookingId), eq(bookings.userId, userId)),
      columns: {
        id: true,
        status: true,
        priceAtBooking: true,
        providerQuotedPrice: true,
        providerId: true,
        serviceId: true,
        paymentIntentId: true,
      },
    });

    if (!booking) {
      return new NextResponse("Booking not found or access denied", { status: 404 });
    }

    // Only allow payment if the booking is 'accepted'
    const normalizedStatus = normalizeStatus(booking.status);
    if (normalizedStatus !== "accepted") {
      return new NextResponse(`Cannot pay for booking with status: ${booking.status}`, { status: 400 });
    }

    const baseAmount = getFinalBookingAmountCents({
      providerQuotedPrice: booking.providerQuotedPrice,
      priceAtBooking: booking.priceAtBooking,
    });

    if (!baseAmount) {
      return new NextResponse("This booking needs a final price from the provider before payment.", { status: 400 });
    }

    if (baseAmount <= 0) {
      return new NextResponse("Invalid booking amount", { status: 400 });
    }

    const breakdown = calculateBookingPaymentBreakdown({ servicePriceCents: baseAmount });

    const provider = await db.query.providers.findFirst({
      where: eq(providers.id, booking.providerId),
      columns: { plan: true, stripeConnectId: true, chargesGst: true },
    });

    if (!provider?.stripeConnectId) {
      return new NextResponse("Provider is not configured for Stripe Connect", { status: 400 });
    }

    const service = await db.query.services.findFirst({
      where: eq(services.id, booking.serviceId),
      columns: { chargesGst: true },
    });

    const earnings = calculateEarnings({
      amountInCents: breakdown.servicePriceCents,
      chargesGst: service?.chargesGst ?? provider.chargesGst ?? true,
      platformFeeBps: getPlatformFeeBpsForPlan(normalizeProviderPlan(provider.plan)),
    });

    // Create the Payment Intent (platform charge only; transfer happens later).
    const paymentIntent = await stripe.paymentIntents.create({
      amount: breakdown.totalCents,
      currency: "nzd", // NZD as per spec
      automatic_payment_methods: { enabled: true },
      transfer_group: booking.id,
      metadata: {
        bookingId: booking.id,
        userId,
        providerId: booking.providerId,
        transferGroup: booking.id,
        servicePriceCents: String(breakdown.servicePriceCents),
        serviceFeeCents: String(breakdown.serviceFeeCents),
        totalCents: String(breakdown.totalCents),
        platformFeeCents: String(earnings.platformFeeAmount),
        providerPayoutCents: String(earnings.netAmount),
      },
    });

    // Persist PI id on the booking row so webhooks can find it reliably.
    await db
      .update(bookings)
      .set({
        paymentIntentId: paymentIntent.id,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id));

    return NextResponse.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id });

  } catch (error) {
    console.error("[API_STRIPE_CREATE_INTENT]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

