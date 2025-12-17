import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createNotification } from "@/lib/notifications";

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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`[API_STRIPE_CONNECT_WEBHOOK] Webhook signature verification failed: ${message}`);
    return new NextResponse(`Webhook Error: ${message}`, { status: 400 });
  }

  // Handle the event
  switch (event.type) {
    case "account.updated":
      const account = event.data.object as Stripe.Account;
      const stripeConnectId = account.id;

      console.log(`[API_STRIPE_CONNECT_WEBHOOK] Received account.updated for ${stripeConnectId}`);

      try {
        const provider = await db.query.providers.findFirst({
          where: eq(providers.stripeConnectId, stripeConnectId),
          columns: {
            id: true,
            userId: true,
            chargesEnabled: true,
            payoutsEnabled: true,
          },
        });

        const prevChargesEnabled = provider?.chargesEnabled ?? null;
        const prevPayoutsEnabled = provider?.payoutsEnabled ?? null;

        // Update our provider record with the latest Stripe Connect status
        await db.update(providers)
          .set({
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled,
            updatedAt: new Date(), // Manually update the 'updatedAt' timestamp
          })
          .where(eq(providers.stripeConnectId, stripeConnectId));

        console.log(`[API_STRIPE_CONNECT_WEBHOOK] Provider ${stripeConnectId} updated successfully.`);

        // Best-effort notifications for meaningful changes
        if (provider?.userId) {
          const base = {
            userId: provider.userId,
            type: "stripe_connect",
            actionUrl: "/dashboard/provider/earnings",
            providerId: provider.id,
            idempotencyKey: `stripe-connect:${event.id}:${provider.userId}`,
            ttlSeconds: 60 * 60 * 24,
          } as const;

          if (prevPayoutsEnabled !== null && prevPayoutsEnabled !== account.payouts_enabled) {
            await createNotification({
              ...base,
              title: account.payouts_enabled ? "Payouts enabled" : "Payouts disabled",
              body: account.payouts_enabled
                ? "Your Stripe payouts are enabled. You can now receive payouts for paid bookings."
                : "Your Stripe payouts are currently disabled. You may need to complete additional verification in Stripe.",
            });
          }

          if (prevChargesEnabled !== null && prevChargesEnabled !== account.charges_enabled) {
            await createNotification({
              ...base,
              title: account.charges_enabled ? "Payments enabled" : "Payments disabled",
              body: account.charges_enabled
                ? "You can now accept payments for new bookings."
                : "Your ability to accept payments is currently disabled. Please review your Stripe Connect status.",
            });
          }
        }
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

