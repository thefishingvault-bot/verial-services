import { NextResponse } from "next/server";
import Stripe from "stripe";
import { eq } from "drizzle-orm";

import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { bookings, providerEarnings, providers, services } from "@/db/schema";
import { assertTransition, normalizeStatus, type BookingStatus } from "@/lib/booking-state";
import { calculateEarnings } from "@/lib/earnings";
import { getPlatformFeeBpsForPlan, normalizeProviderPlan } from "@/lib/provider-subscription";

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

  const existing = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    columns: { id: true, status: true, paymentIntentId: true },
  });

  if (!existing) {
    console.info("[API_STRIPE_BOOKINGS_WEBHOOK] Booking not found", {
      source,
      eventId,
      bookingId,
      paymentIntentId,
    });
    return { updated: false };
  }

  const current = normalizeStatus(existing.status) as BookingStatus;
  const alreadyPaid = [
    "paid",
    "completed_by_provider",
    "completed",
    "refunded",
    "disputed",
  ].includes(current);

  // Idempotency: if already paid/completed, only ensure PI linkage.
  if (alreadyPaid) {
    if (existing.paymentIntentId !== paymentIntentId) {
      await db
        .update(bookings)
        .set({ paymentIntentId, updatedAt: new Date() })
        .where(eq(bookings.id, bookingId));
    }

    console.log(
      `[API_STRIPE_BOOKINGS_WEBHOOK] event=${source} bookingId=${bookingId} pi=${paymentIntentId} updated=false already=${current}`,
    );
    return { updated: false };
  }

  try {
    assertTransition(existing.status, "paid");
  } catch (error: unknown) {
    console.warn("[API_STRIPE_BOOKINGS_WEBHOOK] Cannot transition booking to paid", {
      source,
      eventId,
      bookingId,
      current: existing.status,
      normalized: current,
      paymentIntentId,
      error: error instanceof Error ? error.message : String(error),
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
    .where(eq(bookings.id, bookingId))
    .returning({ id: bookings.id, status: bookings.status, paymentIntentId: bookings.paymentIntentId });

  const updated = rows.length > 0;

  console.log(
    `[API_STRIPE_BOOKINGS_WEBHOOK] event=${source} bookingId=${bookingId} pi=${paymentIntentId} updated=${updated}`,
  );

  return { updated };
}

async function resolveBookingIdFromPaymentIntent(params: {
  bookingIdFromMeta: string | null;
  paymentIntentId: string;
}): Promise<string | null> {
  const { bookingIdFromMeta, paymentIntentId } = params;

  if (bookingIdFromMeta && bookingIdFromMeta.trim()) return bookingIdFromMeta;

  const byPi = await db.query.bookings.findFirst({
    where: eq(bookings.paymentIntentId, paymentIntentId),
    columns: { id: true },
  });

  return byPi?.id ?? null;
}

async function upsertProviderEarningsHeld(params: {
  source: string;
  eventId: string;
  bookingId: string;
  paymentIntentId: string;
  amountChargedInCents?: number | null;
}) {
  const { source, eventId, bookingId, paymentIntentId, amountChargedInCents } = params;

  const booking = await db
    .select({
      id: bookings.id,
      providerId: bookings.providerId,
      serviceId: bookings.serviceId,
      priceAtBooking: bookings.priceAtBooking,
      serviceChargesGst: services.chargesGst,
      providerChargesGst: providers.chargesGst,
      providerPlan: providers.plan,
    })
    .from(bookings)
    .leftJoin(services, eq(services.id, bookings.serviceId))
    .leftJoin(providers, eq(providers.id, bookings.providerId))
    .where(eq(bookings.id, bookingId))
    .then((rows) => rows[0]);

  if (!booking) {
    console.info("[API_STRIPE_BOOKINGS_WEBHOOK] Earnings upsert skipped: booking not found", {
      source,
      eventId,
      bookingId,
      paymentIntentId,
      upserted: false,
    });
    return { upserted: false };
  }

  const amountCandidate =
    (Number.isFinite(amountChargedInCents ?? NaN) ? (amountChargedInCents as number) : null) ??
    (Number.isFinite(booking.priceAtBooking ?? NaN) ? (booking.priceAtBooking as number) : null);

  if (!amountCandidate || amountCandidate <= 0) {
    console.warn("[API_STRIPE_BOOKINGS_WEBHOOK] Earnings upsert skipped: invalid amount", {
      source,
      eventId,
      bookingId,
      paymentIntentId,
      amountChargedInCents: amountChargedInCents ?? null,
      priceAtBooking: booking.priceAtBooking ?? null,
      upserted: false,
    });
    return { upserted: false };
  }

  const chargesGst = booking.serviceChargesGst ?? booking.providerChargesGst ?? true;
  const platformFeeBps = getPlatformFeeBpsForPlan(normalizeProviderPlan(booking.providerPlan));

  const breakdown = calculateEarnings({
    amountInCents: amountCandidate,
    chargesGst,
    platformFeeBps: Number.isFinite(platformFeeBps) ? platformFeeBps : undefined,
  });

  await db
    .insert(providerEarnings)
    .values({
      id: `earn_${bookingId}`,
      bookingId,
      providerId: booking.providerId,
      serviceId: booking.serviceId,
      grossAmount: breakdown.grossAmount,
      platformFeeAmount: breakdown.platformFeeAmount,
      gstAmount: breakdown.gstAmount,
      netAmount: breakdown.netAmount,
      status: "held",
      stripePaymentIntentId: paymentIntentId,
      stripeTransferId: null,
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: providerEarnings.bookingId,
      set: {
        grossAmount: breakdown.grossAmount,
        platformFeeAmount: breakdown.platformFeeAmount,
        gstAmount: breakdown.gstAmount,
        netAmount: breakdown.netAmount,
        status: "held",
        stripePaymentIntentId: paymentIntentId,
        stripeTransferId: null,
        updatedAt: new Date(),
      },
    });

  console.info("[API_STRIPE_BOOKINGS_WEBHOOK] Earnings upserted", {
    source,
    eventId,
    bookingId,
    paymentIntentId,
    upserted: true,
  });

  return { upserted: true };
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
    try {
      event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_BOOKINGS_WEBHOOK_SECRET);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.warn(`[API_STRIPE_BOOKINGS_WEBHOOK] Webhook signature verification failed: ${message}`);
      return new NextResponse("Invalid signature", { status: 400 });
    }

    console.info("[API_STRIPE_BOOKINGS_WEBHOOK] Webhook verified", {
      eventId: event.id,
      type: event.type,
      livemode: (event as unknown as { livemode?: boolean }).livemode ?? null,
    });

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "payment") break;

        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null;

        const bookingIdFromMeta =
          (session.metadata as Record<string, string> | null | undefined)?.bookingId ?? null;

        const bookingId = paymentIntentId
          ? await resolveBookingIdFromPaymentIntent({
              bookingIdFromMeta,
              paymentIntentId,
            })
          : bookingIdFromMeta;

        console.info("[API_STRIPE_BOOKINGS_WEBHOOK] checkout.session.completed", {
          eventId: event.id,
          bookingId,
          paymentIntentId,
          mode: session.mode,
        });

        if (!bookingId) {
          console.info("[API_STRIPE_BOOKINGS_WEBHOOK] Booking not found for PI", {
            eventId: event.id,
            type: event.type,
            paymentIntentId,
          });
          return new NextResponse(null, { status: 200 });
        }

        await markBookingPaid({
          source: event.type,
          eventId: event.id,
          bookingId,
          paymentIntentId,
        });

        if (paymentIntentId) {
          await upsertProviderEarningsHeld({
            source: event.type,
            eventId: event.id,
            bookingId,
            paymentIntentId,
            amountChargedInCents: typeof session.amount_total === "number" ? session.amount_total : null,
          });
        }

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

        const bookingIdFromMeta = (pi.metadata as Record<string, string> | null | undefined)?.bookingId ?? null;
        const bookingId = await resolveBookingIdFromPaymentIntent({
          bookingIdFromMeta,
          paymentIntentId: pi.id,
        });

        console.info("[API_STRIPE_BOOKINGS_WEBHOOK] payment_intent.succeeded", {
          eventId: event.id,
          bookingId,
          paymentIntentId: pi.id,
        });

        if (!bookingId) {
          console.info("[API_STRIPE_BOOKINGS_WEBHOOK] Booking not found for PI", {
            eventId: event.id,
            type: event.type,
            paymentIntentId: pi.id,
          });
          return new NextResponse(null, { status: 200 });
        }

        await markBookingPaid({
          source: event.type,
          eventId: event.id,
          bookingId,
          paymentIntentId: pi.id,
        });

        await upsertProviderEarningsHeld({
          source: event.type,
          eventId: event.id,
          bookingId,
          paymentIntentId: pi.id,
          amountChargedInCents:
            typeof (pi as unknown as { amount_received?: unknown }).amount_received === "number"
              ? ((pi as unknown as { amount_received: number }).amount_received || pi.amount)
              : pi.amount,
        });

        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;

        const bookingIdFromMeta = (pi.metadata as Record<string, string> | null | undefined)?.bookingId ?? null;
        const bookingId = await resolveBookingIdFromPaymentIntent({
          bookingIdFromMeta,
          paymentIntentId: pi.id,
        });

        console.info("[API_STRIPE_BOOKINGS_WEBHOOK] payment_intent.payment_failed", {
          eventId: event.id,
          bookingId,
          paymentIntentId: pi.id,
          status: pi.status,
        });

        if (!bookingId) {
          console.info("[API_STRIPE_BOOKINGS_WEBHOOK] Booking not found for PI", {
            eventId: event.id,
            type: event.type,
            paymentIntentId: pi.id,
          });
          return new NextResponse(null, { status: 200 });
        }

        // Idempotency: ensure PI linkage even when payment fails (status remains accepted).
        const existing = await db.query.bookings.findFirst({
          where: eq(bookings.id, bookingId),
          columns: { id: true, status: true, paymentIntentId: true },
        });

        let linked = false;
        if (existing && existing.paymentIntentId !== pi.id) {
          await db
            .update(bookings)
            .set({ paymentIntentId: pi.id, updatedAt: new Date() })
            .where(eq(bookings.id, bookingId));
          linked = true;
        }

        console.log(
          `[API_STRIPE_BOOKINGS_WEBHOOK] event=${event.type} bookingId=${bookingId} pi=${pi.id} updated=${linked} (payment_failed)`,
        );

        // Intentionally no DB change; booking remains accepted.
        break;
      }

      default:
        break;
    }
  } catch (error: unknown) {
    // Unexpected/unhandled errors must return 500 so Stripe retries.
    console.error("[API_STRIPE_BOOKINGS_WEBHOOK] Unexpected handler error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new NextResponse("Unhandled webhook error", { status: 500 });
  }

  return new NextResponse(null, { status: 200 });
}
