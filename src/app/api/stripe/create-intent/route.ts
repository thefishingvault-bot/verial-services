import { stripe } from "@/lib/stripe";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPlatformFeeBpsForPlan, normalizeProviderPlan } from "@/lib/provider-subscription";

// This route is for creating a Payment Intent for a *platform* charge.
// This will be adapted later for Connect (destination charges).

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { amount, bookingId, providerStripeId } = await req.json();

    if (!amount || !bookingId || !providerStripeId) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    // Validate amount (e.g., must be at least $1.00 NZD)
    if (amount < 100) {
      return new NextResponse("Amount must be at least $1.00 NZD", { status: 400 });
    }

    const provider = await db.query.providers.findFirst({
      where: eq(providers.stripeConnectId, providerStripeId),
      columns: { plan: true },
    });

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
        destination: providerStripeId, // Destination charge to the provider
      },
      metadata: {
        userId,
        bookingId,
        platform_fee_bps: feeBps.toString(),
      },
    });

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });

  } catch (error) {
    console.error("[API_STRIPE_CREATE_INTENT]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

