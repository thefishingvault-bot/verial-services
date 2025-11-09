import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";

// Note: We need to use the 'nodejs' runtime for webhooks
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get("Stripe-Signature") as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("[API_STRIPE_WEBHOOK] Missing Stripe webhook secret");
    return new NextResponse("Webhook secret not configured", { status: 500 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error: any) {
    console.warn(`[API_STRIPE_WEBHOOK] Webhook signature verification failed: ${error.message}`);
    return new NextResponse(`Webhook Error: ${error.message}`, { status: 400 });
  }

  // Handle the event
  switch (event.type) {
    case "payment_intent.succeeded":
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const { bookingId, userId } = paymentIntent.metadata;

      if (!bookingId || !userId) {
        console.error(`[API_STRIPE_WEBHOOK] Missing metadata (bookingId or userId) on PaymentIntent ${paymentIntent.id}`);
        // Return 200 to Stripe so it doesn't retry, but log the error
        return new NextResponse("Metadata missing", { status: 200 }); 
      }

      console.log(`[API_STRIPE_WEBHOOK] Payment succeeded for Booking: ${bookingId} by User: ${userId}`);

      // --- TODO: Update Booking Status ---
      // In a real scenario, we would update our database here.
      // e.g., await db.update(bookings).set({ status: 'paid' }).where(eq(bookings.id, bookingId));
      // For now, we just log.
      // ------------------------------------

      break;

    case "payment_intent.payment_failed":
      const paymentFailedIntent = event.data.object as Stripe.PaymentIntent;
      console.log(`[API_STRIPE_WEBHOOK] Payment failed: ${paymentFailedIntent.id}`, paymentFailedIntent.last_payment_error?.message);
      break;

    default:
      console.log(`[API_STRIPE_WEBHOOK] Unhandled event type: ${event.type}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  return new NextResponse(null, { status: 200 });
}

