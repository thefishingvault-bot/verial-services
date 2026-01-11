import { NextResponse } from "next/server";
import Stripe from "stripe";
import { and, eq } from "drizzle-orm";

import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { bookings } from "@/db/schema";

export const runtime = "nodejs";

/**
 * Stripe bookings webhook (platform / "Your account" events)
 *
 * Stripe Dashboard wiring (staging/prod):
 * - Create an Event Destination (or webhook endpoint) for "Your account" events (NOT connected accounts)
 * - Endpoint URL: https://<your-domain>/api/webhooks/stripe-bookings
 * - Events:
 *   - checkout.session.completed
 *   - payment_intent.succeeded
 *   - payment_intent.payment_failed (optional)
 *   - checkout.session.async_payment_succeeded / checkout.session.async_payment_failed (optional)
 * - Put the signing secret into STRIPE_BOOKINGS_WEBHOOK_SECRET (do not hardcode)
 */

async function markBookingPaid(params: {
  source: string;
  eventId: string;
  bookingId: string;
  paymentIntentId: string | null;
}) {
  const { source, eventId, bookingId, paymentIntentId } = params;

  if (!bookingId) return { updated: false };

  if (!paymentIntentId) {
    console.info("[API_STRIPE_BOOKINGS_WEBHOOK] Missing paymentIntentId", {
      source,
      eventId,
      bookingId,
    });
    return { updated: false };
  }

  const rows = await db
    .update(bookings)
    .set({
      status: "paid",
      paymentIntentId,
      updatedAt: new Date(),
    })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "accepted")))
    .returning({ id: bookings.id, status: bookings.status, paymentIntentId: bookings.paymentIntentId });

  console.info("[API_STRIPE_BOOKINGS_WEBHOOK] Marked booking paid", {
    source,
    eventId,
    bookingId,
    paymentIntentId,
    updated: rows.length > 0,
  });

  return { updated: rows.length > 0 };
}

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature") ?? req.headers.get("Stripe-Signature");

  if (!process.env.STRIPE_BOOKINGS_WEBHOOK_SECRET) {
    console.error("[API_STRIPE_BOOKINGS_WEBHOOK] Missing STRIPE_BOOKINGS_WEBHOOK_SECRET");
    return new NextResponse("Webhook secret not configured", { status: 500 });
  }

  if (!signature) {
    console.warn("[API_STRIPE_BOOKINGS_WEBHOOK] Missing Stripe-Signature header");
    return new NextResponse("Missing Stripe-Signature header", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_BOOKINGS_WEBHOOK_SECRET);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.warn(`[API_STRIPE_BOOKINGS_WEBHOOK] Webhook signature verification failed: ${message}`);
    return new NextResponse(`Webhook Error: ${message}`, { status: 400 });
  }

  console.info("[API_STRIPE_BOOKINGS_WEBHOOK] Webhook verified", {
    eventId: event.id,
    type: event.type,
    livemode: (event as unknown as { livemode?: boolean }).livemode ?? null,
  });

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "payment") break;

        const bookingId = (session.metadata as Record<string, string> | null | undefined)?.bookingId ?? null;
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null;

        console.info("[API_STRIPE_BOOKINGS_WEBHOOK] checkout.session.completed", {
          eventId: event.id,
          bookingId,
          paymentIntentId,
          mode: session.mode,
        });

        if (!bookingId) {
          console.warn("[API_STRIPE_BOOKINGS_WEBHOOK] Missing metadata.bookingId", {
            eventId: event.id,
            type: event.type,
          });
          break;
        }

        await markBookingPaid({
          source: event.type,
          eventId: event.id,
          bookingId,
          paymentIntentId,
        });

        break;
      }

      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const bookingId = (session.metadata as Record<string, string> | null | undefined)?.bookingId ?? null;
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null;

        console.info("[API_STRIPE_BOOKINGS_WEBHOOK] checkout.session.async_payment_failed", {
          eventId: event.id,
          bookingId,
          paymentIntentId,
        });

        if (!bookingId) {
          console.warn("[API_STRIPE_BOOKINGS_WEBHOOK] Missing metadata.bookingId", {
            eventId: event.id,
            type: event.type,
          });
        }

        // Intentionally no DB change; booking remains accepted.
        break;
      }

      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const bookingId = (pi.metadata as Record<string, string> | null | undefined)?.bookingId ?? null;

        console.info("[API_STRIPE_BOOKINGS_WEBHOOK] payment_intent.succeeded", {
          eventId: event.id,
          bookingId,
          paymentIntentId: pi.id,
        });

        if (!bookingId) {
          console.warn("[API_STRIPE_BOOKINGS_WEBHOOK] Missing metadata.bookingId", {
            eventId: event.id,
            type: event.type,
            paymentIntentId: pi.id,
          });
          break;
        }

        await markBookingPaid({
          source: event.type,
          eventId: event.id,
          bookingId,
          paymentIntentId: pi.id,
        });

        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const bookingId = (pi.metadata as Record<string, string> | null | undefined)?.bookingId ?? null;

        console.info("[API_STRIPE_BOOKINGS_WEBHOOK] payment_intent.payment_failed", {
          eventId: event.id,
          bookingId,
          paymentIntentId: pi.id,
          status: pi.status,
        });

        if (!bookingId) {
          console.warn("[API_STRIPE_BOOKINGS_WEBHOOK] Missing metadata.bookingId", {
            eventId: event.id,
            type: event.type,
            paymentIntentId: pi.id,
          });
        }

        // Intentionally no DB change; booking remains accepted.
        break;
      }

      default:
        break;
    }
  } catch (error: unknown) {
    // Always return 200 to acknowledge receipt; log failures so Stripe can still succeed without retries storming.
    console.warn("[API_STRIPE_BOOKINGS_WEBHOOK] Handler error", {
      type: event.type,
      eventId: event.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return new NextResponse(null, { status: 200 });
}
