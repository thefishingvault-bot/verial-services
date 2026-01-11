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

export async function POST(req: Request, { params }: { params: Promise<{ bookingId: string }> }) {
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
    return new NextResponse(`Cannot confirm completion for status: ${booking.status}`, { status: 400 });
  }

  const provider = await db.query.providers.findFirst({
    where: eq(providers.id, booking.providerId),
    columns: { id: true, stripeConnectId: true, chargesGst: true, plan: true },
  });

  if (!provider?.stripeConnectId) {
    return new NextResponse("Provider is not configured for Stripe Connect", { status: 400 });
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
      return new NextResponse("Missing provider earnings for booking", { status: 409 });
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
          },
        });

  if (!effectiveEarning || effectiveEarning.providerId !== provider.id) {
    return new NextResponse("Missing provider earnings for booking", { status: 409 });
  }

  console.info("[API_BOOKING_CONFIRM_COMPLETION] State", {
    bookingId: booking.id,
    bookingStatus: booking.status,
    earningStatus: effectiveEarning.status,
    hasTransfer: !!effectiveEarning.stripeTransferId,
  });

  if (!Number.isFinite(effectiveEarning.netAmount) || effectiveEarning.netAmount <= 0) {
    return new NextResponse("Invalid net amount", { status: 409 });
  }

  // Legacy compatibility:
  // - awaiting_payout / paid_out: funds are already on (or have left) the connected account; do NOT create a new transfer.
  if (effectiveEarning.status === "awaiting_payout" || effectiveEarning.status === "paid_out") {
    const [updatedBooking] = await db
      .update(bookings)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(bookings.id, booking.id))
      .returning({ id: bookings.id, status: bookings.status });

    return NextResponse.json({ ok: true, booking: updatedBooking ?? { id: booking.id, status: "completed" } });
  }

  if (effectiveEarning.status === "refunded") {
    return new NextResponse("Cannot confirm completion for refunded booking", { status: 409 });
  }

  // Normal path: funds are held until customer confirmation.
  // Accept "pending" here as a resilience measure (it can occur if an older flow created the row but didn't mark it held).
  if (!["held", "pending", "transferred"].includes(effectiveEarning.status)) {
    return new NextResponse(`Earnings not transferable (status: ${effectiveEarning.status})`, { status: 409 });
  }

  // Idempotency: if transfer already exists, do not create another.
  if (effectiveEarning.stripeTransferId) {
    const [updatedBooking] = await db
      .update(bookings)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(bookings.id, booking.id))
      .returning({ id: bookings.id, status: bookings.status });

    return NextResponse.json({ ok: true, booking: updatedBooking ?? { id: booking.id, status: "completed" } });
  }

  // Validate transition and then perform booking update + transfer.
  assertTransition(booking.status, "completed");

  const transfer = await stripe.transfers.create(
    {
      amount: effectiveEarning.netAmount,
      currency: "nzd",
      destination: provider.stripeConnectId,
      transfer_group: booking.id,
      metadata: {
        bookingId: booking.id,
        providerId: provider.id,
      },
    },
    { idempotencyKey: `booking_${booking.id}_confirm_completion_transfer` },
  );

  console.info("[API_BOOKING_CONFIRM_COMPLETION] Transfer created", {
    bookingId: booking.id,
    transferId: transfer.id,
  });

  await db
    .update(providerEarnings)
    .set({
      status: "transferred",
      stripeTransferId: transfer.id,
      transferredAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(providerEarnings.id, effectiveEarning.id));

  const [updatedBooking] = await db
    .update(bookings)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(bookings.id, booking.id))
    .returning({ id: bookings.id, status: bookings.status });

  return NextResponse.json({ ok: true, booking: updatedBooking, transferId: transfer.id });
}
