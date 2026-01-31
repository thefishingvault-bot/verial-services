import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import Stripe from "stripe";

import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { bookings, providerEarnings, providers, services } from "@/db/schema";
import { assertTransition, type BookingStatus } from "@/lib/booking-state";
import { calculateEarnings } from "@/lib/earnings";
import { calculateBookingPaymentBreakdown, parseStripeMetadataInt } from "@/lib/payments/fees";
import { calculateDestinationChargeAmounts } from "@/lib/payments/platform-fee";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const body = (await req.json().catch(() => null)) as
      | {
          sessionId?: string;
        }
      | null;

    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : null;

    const { bookingId } = await params;
    if (!bookingId) return new NextResponse("Missing bookingId", { status: 400 });

    const booking = await db
      .select({
        id: bookings.id,
        status: bookings.status,
        paymentIntentId: bookings.paymentIntentId,
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
      .where(and(eq(bookings.id, bookingId), eq(bookings.userId, userId)))
      .then((rows) => rows[0]);

    if (!booking) return new NextResponse("Booking not found", { status: 404 });

    const current = booking.status as BookingStatus;
    const alreadyPaid = ["paid", "completed_by_provider", "completed", "refunded", "disputed"].includes(current);

    const resolvePaymentIntentId = async (): Promise<string | null> => {
      if (booking.paymentIntentId) return booking.paymentIntentId;

      // Preferred: if we have a Checkout Session id, resolve the PI from it.
      if (sessionId) {
        try {
          const session = await stripe.checkout.sessions.retrieve(sessionId);
          const piId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? null;
          if (piId) return piId;
        } catch {
          // Fall through.
        }
      }

      // Fallback: attempt to locate the PaymentIntent via metadata.bookingId.
      // This covers cases where we didn't persist the PI id before redirect.
      try {
        const escapedBookingId = bookingId.replace(/'/g, "\\'");
        const results = await stripe.paymentIntents.search({
          query: `metadata['bookingId']:'${escapedBookingId}' AND status:'succeeded'`,
          limit: 1,
        });

        const found = results.data?.[0];
        if (found?.id) return found.id;
      } catch {
        // Stripe search may not be enabled; ignore.
      }

      return null;
    };

    const resolvedPiId = await resolvePaymentIntentId();
    if (!resolvedPiId) {
      return NextResponse.json(
        { ok: true, updated: false, reason: "missing_payment_intent" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const pi = await stripe.paymentIntents.retrieve(resolvedPiId);

    console.info("[API_BOOKING_SYNC_PAYMENT] Checked", {
      bookingId,
      bookingStatus: booking.status,
      paymentIntentId: pi.id,
      paymentIntentStatus: pi.status,
    });

    if (pi.status !== "succeeded") {
      return NextResponse.json(
        { ok: true, updated: false, paymentIntentStatus: pi.status },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    // Best-effort: if the payment succeeded, ensure the provider earnings ledger row exists.
    const ensureEarningsRecorded = async () => {
      const baseAmountFromMeta =
        parseStripeMetadataInt(pi.metadata, "servicePriceCents") ??
        parseStripeMetadataInt(pi.metadata, "bookingBaseAmountCents");
      const feeFromMeta =
        parseStripeMetadataInt(pi.metadata, "serviceFeeCents") ??
        parseStripeMetadataInt(pi.metadata, "customerServiceFeeCents");
      const totalFromMeta =
        parseStripeMetadataInt(pi.metadata, "totalCents") ??
        parseStripeMetadataInt(pi.metadata, "totalChargeCents");

      const platformFeeFromMeta = parseStripeMetadataInt(pi.metadata, "platformFeeCents");
      const providerPayoutFromMeta = parseStripeMetadataInt(pi.metadata, "providerPayoutCents");

      const baseAmountCandidate =
        (typeof baseAmountFromMeta === "number" && baseAmountFromMeta > 0 ? baseAmountFromMeta : null) ??
        booking.priceAtBooking;

      const computedPayment = calculateBookingPaymentBreakdown({ servicePriceCents: baseAmountCandidate });
      const customerServiceFeeCents = Math.max(0, Math.trunc(feeFromMeta ?? computedPayment.serviceFeeCents));
      const customerTotalChargedAmount = Math.max(
        0,
        Math.trunc(totalFromMeta ?? (baseAmountCandidate + customerServiceFeeCents)),
      );

      const amounts = calculateDestinationChargeAmounts({
        servicePriceCents: baseAmountCandidate,
        serviceFeeCents: customerServiceFeeCents,
        providerPlan: booking.providerPlan,
      });

      const platformFeeCents =
        (typeof platformFeeFromMeta === "number" && platformFeeFromMeta >= 0 ? platformFeeFromMeta : null) ??
        amounts.platformFeeCents;

      const providerPayoutCents =
        (typeof providerPayoutFromMeta === "number" && providerPayoutFromMeta >= 0 ? providerPayoutFromMeta : null) ??
        Math.max(0, baseAmountCandidate - platformFeeCents);

      const chargesGst = booking.serviceChargesGst ?? booking.providerChargesGst ?? true;
      const gstAmount = calculateEarnings({ amountInCents: baseAmountCandidate, chargesGst, platformFeeBps: 0 }).gstAmount;

      // Best-effort: capture auto transfer id and settlement fields.
      let balanceTxId: string | null = null;
      let chargeId: string | null = null;
      let transferId: string | null = null;
      let stripeFeeAmount: number | null = null;
      let stripeNetAmount: number | null = null;
      let stripeAmount: number | null = null;
      try {
        const piWithCharges = (await stripe.paymentIntents.retrieve(pi.id, {
          expand: ["charges.data.balance_transaction"],
        })) as Stripe.PaymentIntent & {
          charges?: {
            data?: Array<{
              id?: string;
              balance_transaction?: string | Stripe.BalanceTransaction | null;
              transfer?: string | Stripe.Transfer | null;
            }>;
          };
        };

        const firstCharge = piWithCharges.charges?.data?.[0] ?? null;
        chargeId = typeof firstCharge?.id === "string" ? firstCharge.id : null;

        const transfer = firstCharge?.transfer ?? null;
        transferId = typeof transfer === "string" ? transfer : transfer?.id ?? null;

        const raw = firstCharge?.balance_transaction ?? null;
        const btObj = typeof raw === "string" ? null : raw;
        balanceTxId = typeof raw === "string" ? raw : btObj?.id ?? null;
        stripeFeeAmount = typeof btObj?.fee === "number" ? btObj.fee : null;
        stripeNetAmount = typeof btObj?.net === "number" ? btObj.net : null;
        stripeAmount = typeof btObj?.amount === "number" ? btObj.amount : null;
      } catch {
        // Ignore.
      }

      const isDestinationCharge = !!transferId;
      const earningStatus = isDestinationCharge ? "transferred" : "held";
      const destinationTransfer = isDestinationCharge
        ? { stripeTransferId: transferId, transferredAt: new Date(pi.created * 1000) }
        : {};

      await db
        .insert(providerEarnings)
        .values({
          id: `earn_${bookingId}`,
          bookingId,
          providerId: booking.providerId,
          serviceId: booking.serviceId,
          grossAmount: baseAmountCandidate,
          platformFeeAmount: platformFeeCents,
          gstAmount,
          netAmount: providerPayoutCents,
          status: earningStatus,
          stripePaymentIntentId: pi.id,
          stripeBalanceTransactionId: balanceTxId,
          stripeChargeId: chargeId,
          stripeFeeAmount,
          stripeNetAmount,
          stripeAmount,
          customerServiceFeeAmount: customerServiceFeeCents,
          customerTotalChargedAmount,
          ...destinationTransfer,
          paidAt: new Date(pi.created * 1000),
        })
        .onConflictDoUpdate({
          target: providerEarnings.bookingId,
          set: {
            grossAmount: baseAmountCandidate,
            platformFeeAmount: platformFeeCents,
            gstAmount,
            netAmount: providerPayoutCents,
            status: earningStatus,
            stripePaymentIntentId: pi.id,
            stripeBalanceTransactionId: balanceTxId,
            stripeChargeId: chargeId,
            stripeFeeAmount,
            stripeNetAmount,
            stripeAmount,
            customerServiceFeeAmount: customerServiceFeeCents,
            customerTotalChargedAmount,
            ...destinationTransfer,
            paidAt: new Date(pi.created * 1000),
            updatedAt: new Date(),
          },
        });
    };

    if (alreadyPaid) {
      if (booking.paymentIntentId !== pi.id) {
        const rows = await db
          .update(bookings)
          .set({ paymentIntentId: pi.id, updatedAt: new Date() })
          .where(eq(bookings.id, bookingId))
          .returning({ id: bookings.id, status: bookings.status, paymentIntentId: bookings.paymentIntentId });

        console.info("[API_BOOKING_SYNC_PAYMENT] Linked", { bookingId, rows });
      }

      try {
        await ensureEarningsRecorded();
      } catch (earningsError) {
        console.warn("[API_BOOKING_SYNC_PAYMENT] Failed to ensure earnings recorded", {
          bookingId,
          error: earningsError instanceof Error ? earningsError.message : String(earningsError),
        });
      }

      return NextResponse.json(
        { ok: true, updated: false, already: booking.status },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    assertTransition(current, "paid");

    const rows = await db
      .update(bookings)
      .set({ status: "paid", paymentIntentId: pi.id, updatedAt: new Date() })
      .where(eq(bookings.id, bookingId))
      .returning({ id: bookings.id, status: bookings.status, paymentIntentId: bookings.paymentIntentId });

    console.info("[API_BOOKING_SYNC_PAYMENT] Updated", { bookingId, rows });

    try {
      await ensureEarningsRecorded();
    } catch (earningsError) {
      console.warn("[API_BOOKING_SYNC_PAYMENT] Failed to ensure earnings recorded", {
        bookingId,
        error: earningsError instanceof Error ? earningsError.message : String(earningsError),
      });
    }

    return NextResponse.json(
      { ok: true, updated: rows.length > 0, rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[API_BOOKING_SYNC_PAYMENT]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
