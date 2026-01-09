import { stripe } from "@/lib/stripe";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookings, providers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getPlatformFeeBpsForPlan, normalizeProviderPlan } from "@/lib/provider-subscription";
import { normalizeStatus } from "@/lib/booking-state";

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
        providerId: true,
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

    const amount = booking.priceAtBooking;
    // Validate amount (e.g., must be at least $1.00 NZD)
    if (!amount || amount < 100) {
      return new NextResponse("Amount must be at least $1.00 NZD", { status: 400 });
    }

    const provider = await db.query.providers.findFirst({
      where: eq(providers.id, booking.providerId),
      columns: { plan: true, stripeConnectId: true },
    });

    if (!provider?.stripeConnectId) {
      return new NextResponse("Provider is not configured for Stripe Connect", { status: 400 });
    }

    // Platform fee can be reduced/removed for subscribed providers
    const feeBps = getPlatformFeeBpsForPlan(normalizeProviderPlan(provider?.plan));
    const applicationFeeAmount = Math.ceil(amount * (feeBps / 10000));

    // Create the Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: "nzd", // NZD as per spec
      automatic_payment_methods: { enabled: true },
      application_fee_amount: applicationFeeAmount,
      transfer_data: {
        destination: provider.stripeConnectId, // Destination charge to the provider
      },
      metadata: {
        bookingId: booking.id,
        userId,
        providerId: booking.providerId,
        platform_fee_bps: feeBps.toString(),
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

