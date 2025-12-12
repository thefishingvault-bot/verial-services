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

  const loadBooking = async (bookingId: string) =>
    db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
      columns: {
        id: true,
        status: true,
        priceAtBooking: true,
        providerId: true,
        serviceId: true,
        userId: true,
        paymentIntentId: true,
      },
      with: {
        provider: { columns: { userId: true, businessName: true } },
        service: { columns: { title: true } },
      },
    });

  const notifyCustomer = async (
    userId: string,
    bookingId: string,
    title: string,
    body: string,
  ) =>
    createNotification({
      userId,
      title,
      body,
      bookingId,
      actionUrl: `/dashboard/bookings/${bookingId}`,
    });

  const markRefunded = async (bookingId: string) => {
    const booking = await loadBooking(bookingId);
    if (!booking) return NextResponse.json({ ok: true });

    try {
      assertTransition(booking.status as BookingStatus, "refunded");
    } catch (err) {
      console.warn(`[API_STRIPE_WEBHOOK] Invalid refund transition for ${bookingId}:`, err);
      return NextResponse.json({ ok: true });
    }

    await db
      .update(bookings)
      .set({ status: "refunded", updatedAt: new Date() })
      .where(eq(bookings.id, bookingId));

    await db
      .update(providerEarnings)
      .set({ status: "refunded", updatedAt: new Date() })
      .where(eq(providerEarnings.bookingId, bookingId));

    if (booking.userId) {
      await notifyCustomer(
        booking.userId,
        bookingId,
        "Payment refunded",
        `Your payment for ${booking.service?.title ?? "your booking"} was refunded.`,
      );
    }

    if (booking.provider?.userId) {
      await createNotification({
        userId: booking.provider.userId,
        title: "Booking refunded",
        body: `A refund was processed for booking ${bookingId}.`,
        bookingId,
        actionUrl: `/dashboard/bookings/provider`,
      });
    }

    return NextResponse.json({ ok: true });
  };

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

    case "payment_intent.payment_failed": {
      const paymentFailedIntent = event.data.object as Stripe.PaymentIntent;
      console.log(
        `[API_STRIPE_WEBHOOK] Payment failed: ${paymentFailedIntent.id}`,
        paymentFailedIntent.last_payment_error?.message,
      );

      // Notify provider and customer, clear unusable PI so they can retry
      try {
        const bookingIdMeta = paymentFailedIntent.metadata?.bookingId;
        const customerId = paymentFailedIntent.metadata?.userId;
        if (bookingIdMeta) {
          const booking = await loadBooking(bookingIdMeta);

          if (booking) {
            await db
              .update(bookings)
              .set({
                paymentIntentId: null,
                updatedAt: new Date(),
              })
              .where(eq(bookings.id, bookingIdMeta));

            if (customerId) {
              await notifyCustomer(
                customerId,
                bookingIdMeta,
                "Payment failed",
                `Your payment for ${booking.service?.title ?? "your booking"} failed. Please try another payment method.`,
              );

              const client = await clerkClient();
              const customerUser = await client.users.getUser(customerId);
              const email = customerUser.emailAddresses[0]?.emailAddress;
              if (email) {
                await sendEmail({
                  to: email,
                  subject: `Payment failed for booking ${bookingIdMeta}`,
                  html: `<p>Your payment for ${booking.service?.title ?? "your booking"} failed.</p><p>Please retry payment from your dashboard.</p>`,
                });
              }
            }

            if (booking.provider?.userId) {
              await createNotification({
                userId: booking.provider.userId,
                message: `Payment failed for booking ${booking.id}.`,
                href: `/dashboard/bookings/provider`,
              });
            }
          }
        }
      } catch (notifyError) {
        console.error("[API_STRIPE_WEBHOOK] Failed to handle payment failure", notifyError);
      }
      break;
    }

    case "payment_intent.canceled": {
      const canceledPi = event.data.object as Stripe.PaymentIntent;
      const bookingIdMeta = canceledPi.metadata?.bookingId;
      const customerId = canceledPi.metadata?.userId;

      if (bookingIdMeta) {
        try {
          await db
            .update(bookings)
            .set({ paymentIntentId: null, updatedAt: new Date() })
            .where(eq(bookings.id, bookingIdMeta));

          if (customerId) {
            await notifyCustomer(
              customerId,
              bookingIdMeta,
              "Payment expired",
              "Your payment session expired. Please retry checkout to confirm your booking.",
            );
          }
        } catch (err) {
          console.error("[API_STRIPE_WEBHOOK] Failed to handle canceled PI", err);
        }
      }

      break;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (piId) {
        const pi = await stripe.paymentIntents.retrieve(piId);
        const bookingIdMeta = pi.metadata?.bookingId;
        if (bookingIdMeta) {
          const result = await markRefunded(bookingIdMeta);
          if (result) return result;
        }
      }
      break;
    }

    case "refund.updated": {
      const refund = event.data.object as Stripe.Refund;
      const piId = refund.payment_intent as string | null;
      if (piId) {
        const pi = await stripe.paymentIntents.retrieve(piId);
        const bookingIdMeta = pi.metadata?.bookingId;
        if (bookingIdMeta) {
          const result = await markRefunded(bookingIdMeta);
          if (result) return result;
        }
      }
      break;
    }

    default:
      console.log(`[API_STRIPE_WEBHOOK] Unhandled event type: ${event.type}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  return new NextResponse(null, { status: 200 });
}

