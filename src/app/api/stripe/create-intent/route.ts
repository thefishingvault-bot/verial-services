import { stripe } from "@/lib/stripe";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookings, providers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { normalizeStatus } from "@/lib/booking-state";
import { getFinalBookingAmountCents } from "@/lib/booking-price";
import { calculateBookingPaymentBreakdown } from "@/lib/payments/fees";
import { calculateDestinationChargeAmounts } from "@/lib/payments/platform-fee";

// This route creates a PaymentIntent on the *platform* account, using Connect destination charges.

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

    const providerStripeAccountId = provider?.stripeConnectId ?? null;
    if (!providerStripeAccountId || !providerStripeAccountId.startsWith("acct_")) {
      return new NextResponse("Provider is not connected to Stripe yet", { status: 400 });
    }

    const amounts = calculateDestinationChargeAmounts({
      servicePriceCents: breakdown.servicePriceCents,
      serviceFeeCents: breakdown.serviceFeeCents,
      providerPlan: provider?.plan,
    });

    // Create the PaymentIntent (destination charge; Stripe routes funds automatically).
    const paymentIntent = await stripe.paymentIntents.create({
      amount: breakdown.totalCents,
      currency: "nzd", // NZD as per spec
      automatic_payment_methods: { enabled: true },
      transfer_group: booking.id,
      application_fee_amount: amounts.applicationFeeCents,
      transfer_data: { destination: providerStripeAccountId },
      metadata: {
        bookingId: booking.id,
        userId,
        providerId: booking.providerId,
        servicePriceCents: String(breakdown.servicePriceCents),
        serviceFeeCents: String(breakdown.serviceFeeCents),
        totalCents: String(breakdown.totalCents),
        platformFeeCents: String(amounts.platformFeeCents),
        providerPayoutCents: String(amounts.providerPayoutCents),
        providerTier: String(amounts.providerTier),
        destinationAccountId: String(providerStripeAccountId),
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

