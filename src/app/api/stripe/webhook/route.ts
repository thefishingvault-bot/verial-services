import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { bookings, providerEarnings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { assertTransition, BookingStatus } from "@/lib/booking-state";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { clerkClient } from "@clerk/nextjs/server";
import { calculateEarnings } from "@/lib/earnings";

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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`[API_STRIPE_WEBHOOK] Webhook signature verification failed: ${message}`);
    return new NextResponse(`Webhook Error: ${message}`, { status: 400 });
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

      console.log(`[API_STRIPE_WEBHOOK] Payment succeeded for Booking: ${bookingId}. Updating database...`);

      try {
        const existing = await db.query.bookings.findFirst({
          where: eq(bookings.id, bookingId),
          columns: {
            id: true,
            status: true,
            priceAtBooking: true,
            providerId: true,
            serviceId: true,
          },
          with: {
            provider: { columns: { chargesGst: true } },
            service: { columns: { chargesGst: true } },
          },
        });

        if (!existing) {
          console.warn(`[API_STRIPE_WEBHOOK] Booking not found for ${bookingId}`);
          return new NextResponse("Booking not found", { status: 200 });
        }

        assertTransition(existing.status as BookingStatus, "paid");

        await db
          .update(bookings)
          .set({
            status: "paid",
            paymentIntentId: paymentIntent.id,
          })
          .where(eq(bookings.id, bookingId));

        // Compute earnings deterministically using stored price and GST settings
        const chargesGst = existing.service?.chargesGst ?? existing.provider?.chargesGst ?? true;
        const breakdown = calculateEarnings({
          amountInCents: existing.priceAtBooking,
          chargesGst,
        });

        const piWithCharges = paymentIntent as Stripe.PaymentIntent & {
          charges?: { data?: Array<{ balance_transaction?: string | Stripe.BalanceTransaction }> };
        };

        const balanceTxId = typeof piWithCharges.charges?.data?.[0]?.balance_transaction === "string"
          ? (piWithCharges.charges.data[0].balance_transaction as string)
          : undefined;

        await db
          .insert(providerEarnings)
          .values({
            id: `earn_${bookingId}`,
            bookingId,
            providerId: existing.providerId,
            serviceId: existing.serviceId,
            grossAmount: breakdown.grossAmount,
            platformFeeAmount: breakdown.platformFeeAmount,
            gstAmount: breakdown.gstAmount,
            netAmount: breakdown.netAmount,
            status: "awaiting_payout",
            stripeBalanceTransactionId: balanceTxId,
            paidAt: new Date(paymentIntent.created * 1000),
          })
          .onConflictDoUpdate({
            target: providerEarnings.bookingId,
            set: {
              platformFeeAmount: breakdown.platformFeeAmount,
              gstAmount: breakdown.gstAmount,
              netAmount: breakdown.netAmount,
              status: "awaiting_payout",
              stripeBalanceTransactionId: balanceTxId,
              paidAt: new Date(paymentIntent.created * 1000),
              updatedAt: new Date(),
            },
          });

        console.log(`[API_STRIPE_WEBHOOK] Booking ${bookingId} successfully marked as 'paid' and earnings recorded.`);
      } catch (dbError) {
        console.error(`[API_STRIPE_WEBHOOK] DB Error updating booking ${bookingId}:`, dbError);
        // Return 500 to Stripe so it retries this webhook
        return new NextResponse("Database update failed", { status: 500 });
      }

      break;

    case "payment_intent.payment_failed":
      const paymentFailedIntent = event.data.object as Stripe.PaymentIntent;
      console.log(`[API_STRIPE_WEBHOOK] Payment failed: ${paymentFailedIntent.id}`, paymentFailedIntent.last_payment_error?.message);

      // Notify provider that payment failed so they can follow up
      try {
        const bookingIdMeta = paymentFailedIntent.metadata?.bookingId;
        if (bookingIdMeta) {
          const booking = await db.query.bookings.findFirst({
            where: eq(bookings.id, bookingIdMeta),
            columns: { providerId: true, id: true },
            with: { provider: { columns: { userId: true, businessName: true } } },
          });

          if (booking?.provider?.userId) {
            await createNotification({
              userId: booking.provider.userId,
              message: `Payment failed for booking ${booking.id}.`,
              href: `/dashboard/bookings/provider`,
            });

            const client = await clerkClient();
            const providerUser = await client.users.getUser(booking.provider.userId);
            const email = providerUser.emailAddresses[0]?.emailAddress;
            if (email) {
              await sendEmail({
                to: email,
                subject: `Payment failed for booking ${booking.id}`,
                html: `<p>A customer payment attempt failed.</p><p>Please contact the customer to retry.</p>`,
              });
            }
          }
        }
      } catch (notifyError) {
        console.error("[API_STRIPE_WEBHOOK] Failed to notify provider of payment failure", notifyError);
      }
      break;

    default:
      console.log(`[API_STRIPE_WEBHOOK] Unhandled event type: ${event.type}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  return new NextResponse(null, { status: 200 });
}

