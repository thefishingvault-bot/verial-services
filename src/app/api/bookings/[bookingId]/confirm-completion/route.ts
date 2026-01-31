import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { bookings, providerEarnings, providers, services } from "@/db/schema";
import { assertTransition, normalizeStatus } from "@/lib/booking-state";
import { calculateEarnings } from "@/lib/earnings";
import { getPlatformFeeBpsForPlan, normalizeProviderPlan } from "@/lib/provider-subscription";

export const runtime = "nodejs";

function payoutsDisabledByEnv(): boolean {
  const raw = process.env.DISABLE_PAYOUTS;

  // Safety default: if the flag is missing, disable payouts.
  if (raw == null || raw === "") return true;

  const normalized = raw.trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

function isBalanceInsufficientStripeError(error: unknown): boolean {
  const err = error as
    | {
        code?: unknown;
        message?: unknown;
        raw?: { message?: unknown; code?: unknown };
      }
    | undefined;

  const code = typeof err?.code === "string" ? err.code : typeof err?.raw?.code === "string" ? err.raw.code : null;
  if (code === "balance_insufficient") return true;

  const message =
    typeof err?.message === "string"
      ? err.message
      : typeof err?.raw?.message === "string"
        ? err.raw.message
        : null;
  if (!message) return false;
  return message.toLowerCase().includes("insufficient available funds");
}

function getStripeErrorMeta(error: unknown): {
  stripeErrorCode: string | null;
  stripeErrorType: string | null;
  stripeRequestId: string | null;
  stripeStatusCode: number | null;
  message: string;
} {
  const err = error as
    | {
        code?: unknown;
        type?: unknown;
        requestId?: unknown;
        statusCode?: unknown;
        message?: unknown;
        raw?: { code?: unknown; type?: unknown; requestId?: unknown; statusCode?: unknown; message?: unknown };
      }
    | undefined;

  const stripeErrorCode =
    typeof err?.code === "string" ? err.code : typeof err?.raw?.code === "string" ? err.raw.code : null;
  const stripeErrorType =
    typeof err?.type === "string" ? err.type : typeof err?.raw?.type === "string" ? err.raw.type : null;
  const stripeRequestId =
    typeof err?.requestId === "string"
      ? err.requestId
      : typeof err?.raw?.requestId === "string"
        ? err.raw.requestId
        : null;
  const stripeStatusCode =
    typeof err?.statusCode === "number"
      ? err.statusCode
      : typeof err?.raw?.statusCode === "number"
        ? err.raw.statusCode
        : null;
  const message = typeof err?.message === "string" ? err.message : String(error);

  return { stripeErrorCode, stripeErrorType, stripeRequestId, stripeStatusCode, message };
}

export async function POST(req: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  try {
    const payoutsDisabled = payoutsDisabledByEnv();

    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { bookingId } = await params;
    if (!bookingId) {
      return new NextResponse("Missing bookingId", { status: 400 });
    }

    const booking = await db.query.bookings.findFirst({
      where: and(eq(bookings.id, bookingId), eq(bookings.userId, userId)),
      columns: {
        id: true,
        status: true,
        providerId: true,
        serviceId: true,
        priceAtBooking: true,
        paymentIntentId: true,
      },
    });

    if (!booking) {
      return new NextResponse("Booking not found or access denied", { status: 404 });
    }

    const normalizedStatus = normalizeStatus(booking.status);
    if (normalizedStatus === "completed") {
      return NextResponse.json({ ok: true, booking: { id: booking.id, status: "completed" } });
    }
    if (normalizedStatus !== "completed_by_provider") {
      return new NextResponse(`Cannot confirm completion for status: ${booking.status}`, { status: 409 });
    }

    const provider = await db.query.providers.findFirst({
      where: eq(providers.id, booking.providerId),
      columns: { id: true, stripeConnectId: true, chargesGst: true, plan: true, payoutsEnabled: true },
    });

    if (!provider) {
      return new NextResponse("Provider not found", { status: 404 });
    }

    if (!provider?.stripeConnectId && !payoutsDisabled) {
      return new NextResponse("Provider is not configured for Stripe Connect", { status: 400 });
    }

    if (provider && !provider.payoutsEnabled && !payoutsDisabled) {
      return new NextResponse("Provider payouts are not enabled", { status: 400 });
    }

    const service = await db.query.services.findFirst({
      where: eq(services.id, booking.serviceId),
      columns: { chargesGst: true },
    });

    const earning = await db.query.providerEarnings.findFirst({
      where: eq(providerEarnings.bookingId, booking.id),
      columns: {
        id: true,
        providerId: true,
        netAmount: true,
        status: true,
        stripeTransferId: true,
        stripePaymentIntentId: true,
      },
    });

    const ensureEarningsRecorded = async () => {
      if (!Number.isFinite(booking.priceAtBooking) || booking.priceAtBooking <= 0) {
        return { ok: false as const, reason: "invalid_amount" as const };
      }

    const chargesGst = service?.chargesGst ?? provider.chargesGst ?? true;
    const platformFeeBps = getPlatformFeeBpsForPlan(normalizeProviderPlan(provider.plan));

    const breakdown = calculateEarnings({
      amountInCents: booking.priceAtBooking,
      chargesGst,
      platformFeeBps: Number.isFinite(platformFeeBps) ? platformFeeBps : undefined,
    });

    await db
      .insert(providerEarnings)
      .values({
        id: `earn_${booking.id}`,
        bookingId: booking.id,
        providerId: provider.id,
        serviceId: booking.serviceId,
        grossAmount: breakdown.grossAmount,
        platformFeeAmount: breakdown.platformFeeAmount,
        gstAmount: breakdown.gstAmount,
        netAmount: breakdown.netAmount,
        status: "held",
        stripePaymentIntentId: booking.paymentIntentId,
        paidAt: new Date(),
      })
      .onConflictDoUpdate({
        target: providerEarnings.bookingId,
        set: {
          grossAmount: breakdown.grossAmount,
          platformFeeAmount: breakdown.platformFeeAmount,
          gstAmount: breakdown.gstAmount,
          netAmount: breakdown.netAmount,
          status: "held",
          stripePaymentIntentId: booking.paymentIntentId,
          updatedAt: new Date(),
        },
      });

      return { ok: true as const };
    };

    // If earnings are missing or mismatched, try to repair them so the customer isn't blocked.
    if (!earning || earning.providerId !== provider.id) {
      const created = await ensureEarningsRecorded();
      if (!created.ok) {
        return new NextResponse(
          "Cannot confirm completion yet: booking amount/earnings record is missing.",
          { status: 409 },
        );
      }
    }

    const effectiveEarning =
      earning && earning.providerId === provider.id
        ? earning
        : await db.query.providerEarnings.findFirst({
            where: eq(providerEarnings.bookingId, booking.id),
            columns: {
              id: true,
              providerId: true,
              netAmount: true,
              status: true,
              stripeTransferId: true,
              stripePaymentIntentId: true,
            },
          });

    if (!effectiveEarning || effectiveEarning.providerId !== provider.id) {
      return new NextResponse(
        "Cannot confirm completion yet: provider earnings are missing for this booking.",
        { status: 409 },
      );
    }

    console.info("[API_BOOKING_CONFIRM_COMPLETION] State", {
      bookingId: booking.id,
      bookingStatus: booking.status,
      earningStatus: effectiveEarning.status,
      stripeTransferId: effectiveEarning.stripeTransferId,
      connectId: provider.stripeConnectId,
      payoutsEnabled: provider.payoutsEnabled,
      payoutsDisabled,
    });

    if (!Number.isFinite(effectiveEarning.netAmount) || effectiveEarning.netAmount <= 0) {
      return new NextResponse("Cannot confirm completion yet: invalid provider payout amount.", { status: 409 });
    }

    if (effectiveEarning.status === "refunded") {
      return new NextResponse("Cannot confirm completion for a refunded booking.", { status: 409 });
    }

    // 1) Always complete the booking first (customer action must succeed).
    try {
      assertTransition(booking.status, "completed");
    } catch {
      return new NextResponse(`Cannot confirm completion for status: ${booking.status}`, { status: 409 });
    }

    const [completedBooking] = await db
      .update(bookings)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(bookings.id, booking.id))
      .returning({ id: bookings.id, status: bookings.status });

    // 2) Idempotency / legacy: if we already transferred (or consider it paid), do not create another transfer.
    if (effectiveEarning.stripeTransferId || effectiveEarning.status === "paid_out") {
      return NextResponse.json({
        ok: true,
        booking: completedBooking ?? { id: booking.id, status: "completed" },
        payout: "paid_out",
        transferId: effectiveEarning.stripeTransferId ?? null,
      });
    }

    if (effectiveEarning.status === "awaiting_payout") {
      return NextResponse.json({
        ok: true,
        booking: completedBooking ?? { id: booking.id, status: "completed" },
        payout: "queued",
      });
    }

    // Normal path: funds are held until customer confirmation.
    // Accept "pending" here as a resilience measure (it can occur if an older flow created the row but didn't mark it held).
    if (!["held", "pending", "transferred"].includes(effectiveEarning.status)) {
      return NextResponse.json({
        ok: true,
        booking: completedBooking ?? { id: booking.id, status: "completed" },
        payout: "queued",
        reason: `earning_status_${effectiveEarning.status}`,
      });
    }

    // 3) Ensure earnings are queued for payout.
    if (payoutsDisabled) {
      console.info("[API_BOOKING_CONFIRM_COMPLETION] Payouts disabled", {
        bookingId: booking.id,
        providerId: provider.id,
        earningsId: effectiveEarning.id,
      });

      return NextResponse.json({
        ok: true,
        booking: completedBooking ?? { id: booking.id, status: "completed" },
        bookingStatus: "completed",
        payout: "queued",
        reason: "payouts disabled",
      });
    }

    await db
      .update(providerEarnings)
      .set({ status: "awaiting_payout", updatedAt: new Date() })
      .where(eq(providerEarnings.id, effectiveEarning.id));

    const destination = provider.stripeConnectId;
    if (!destination) {
      console.error("[API_BOOKING_CONFIRM_COMPLETION] Missing stripeConnectId when payouts are enabled", {
        bookingId: booking.id,
        providerId: provider.id,
        earningsId: effectiveEarning.id,
      });

      return NextResponse.json({
        ok: true,
        booking: completedBooking ?? { id: booking.id, status: "completed" },
        bookingStatus: "completed",
        payout: "queued",
        reason: "missing_stripe_connect_id",
      });
    }

    // 4) Best-effort transfer attempt; do not block customer on Stripe balance availability.
    try {
      // Destination charge safety: if Stripe already created a transfer to the connected account,
      // do NOT create an additional manual transfer.
      if (effectiveEarning.stripePaymentIntentId) {
        try {
          const piWithCharges = (await stripe.paymentIntents.retrieve(effectiveEarning.stripePaymentIntentId)) as any;
          const firstCharge = piWithCharges?.charges?.data?.[0] ?? null;
          const transfer = firstCharge?.transfer ?? null;
          const transferId = typeof transfer === "string" ? transfer : transfer?.id ?? null;

          if (transferId) {
            await db
              .update(providerEarnings)
              .set({
                status: "transferred",
                stripeTransferId: transferId,
                transferredAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(providerEarnings.id, effectiveEarning.id));

            return NextResponse.json({
              ok: true,
              booking: completedBooking ?? { id: booking.id, status: "completed" },
              bookingStatus: "completed",
              payout: "paid_out",
              transferId,
              source: "destination_charge",
            });
          }
        } catch {
          // Ignore and fall back to legacy transfer flow.
        }
      }

      const transfer = await stripe.transfers.create(
        {
          amount: effectiveEarning.netAmount,
          currency: "nzd",
          destination,
          transfer_group: booking.id,
          metadata: {
            bookingId: booking.id,
            providerId: provider.id,
            earningsId: effectiveEarning.id,
          },
        },
        { idempotencyKey: `payout_${effectiveEarning.id}` },
      );

      await db
        .update(providerEarnings)
        .set({
          status: "paid_out",
          stripeTransferId: transfer.id,
          transferredAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(providerEarnings.id, effectiveEarning.id));

      console.info("[API_BOOKING_CONFIRM_COMPLETION] Transfer created", {
        bookingId: booking.id,
        providerId: provider.id,
        earningsId: effectiveEarning.id,
        transferId: transfer.id,
      });

      return NextResponse.json({ ok: true, booking: completedBooking, payout: "paid_out", transferId: transfer.id });
    } catch (error) {
      const meta = getStripeErrorMeta(error);
      const queuedReason = isBalanceInsufficientStripeError(error)
        ? "balance_insufficient"
        : meta.stripeErrorCode ?? "transfer_failed";

      console.error("[API_BOOKING_CONFIRM_COMPLETION] Transfer failed", {
        bookingId: booking.id,
        providerId: provider.id,
        earningsId: effectiveEarning.id,
        amount: effectiveEarning.netAmount,
        destination: provider.stripeConnectId,
        queuedReason,
        stripeErrorCode: meta.stripeErrorCode,
        stripeErrorType: meta.stripeErrorType,
        stripeRequestId: meta.stripeRequestId,
        stripeStatusCode: meta.stripeStatusCode,
        error: meta.message,
      });

      // Booking is completed and payout is queued for retry.
      return NextResponse.json({
        ok: true,
        booking: completedBooking ?? { id: booking.id, status: "completed" },
        bookingStatus: "completed",
        payout: "queued",
        reason: queuedReason,
      });
    }
  } catch (error) {
    console.error("[API_BOOKING_CONFIRM_COMPLETION]", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
