import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";

// Note: We need to use the 'nodejs' runtime for webhooks
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get("Stripe-Signature") as string;
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET; // Use the *CONNECT* secret

  if (!webhookSecret) {
    console.error("[API_STRIPE_CONNECT_WEBHOOK] Missing Stripe Connect webhook secret");
    return new NextResponse("Webhook secret not configured", { status: 500 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error: any) {
    console.warn(`[API_STRIPE_CONNECT_WEBHOOK] Webhook signature verification failed: ${error.message}`);
    return new NextResponse(`Webhook Error: ${error.message}`, { status: 400 });
  }

  // Handle the event
  switch (event.type) {
    case "account.updated":
      const account = event.data.object as Stripe.Account;
      const stripeConnectId = account.id;

      console.log(`[API_STRIPE_CONNECT_WEBHOOK] Received account.updated for ${stripeConnectId}`);

      try {
        // Update our provider record with the latest Stripe Connect status
        await db.update(providers)
          .set({
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled,
            updatedAt: new Date(), // Manually update the 'updatedAt' timestamp
          })
          .where(eq(providers.stripeConnectId, stripeConnectId));

        console.log(`[API_STRIPE_CONNECT_WEBHOOK] Provider ${stripeConnectId} updated successfully.`);
      } catch (dbError) {
        console.error(`[API_STRIPE_CONNECT_WEBHOOK] DB Error updating provider ${stripeConnectId}:`, dbError);
        return new NextResponse("Database update failed", { status: 500 });
      }
      break;

    default:
      console.log(`[API_STRIPE_CONNECT_WEBHOOK] Unhandled event type: ${event.type}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  return new NextResponse(null, { status: 200 });
}

