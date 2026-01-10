import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { bookings, providerEarnings, providers } from "@/db/schema";
import { assertTransition, normalizeStatus } from "@/lib/booking-state";

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
    columns: { id: true, status: true, providerId: true },
  });

  if (!booking) {
    return new NextResponse("Booking not found or access denied", { status: 404 });
  }

  const normalizedStatus = normalizeStatus(booking.status);
  if (normalizedStatus !== "completed_by_provider") {
    return new NextResponse(`Cannot confirm completion for status: ${booking.status}`, { status: 400 });
  }

  const provider = await db.query.providers.findFirst({
    where: eq(providers.id, booking.providerId),
    columns: { id: true, stripeConnectId: true },
  });

  if (!provider?.stripeConnectId) {
    return new NextResponse("Provider is not configured for Stripe Connect", { status: 400 });
  }

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

  if (!earning || earning.providerId !== provider.id) {
    return new NextResponse("Missing provider earnings for booking", { status: 409 });
  }

  if (earning.status !== "held" && earning.status !== "transferred") {
    return new NextResponse(`Earnings not transferable (status: ${earning.status})`, { status: 409 });
  }

  if (!Number.isFinite(earning.netAmount) || earning.netAmount <= 0) {
    return new NextResponse("Invalid net amount", { status: 409 });
  }

  // Idempotency: if transfer already exists, do not create another.
  if (earning.stripeTransferId) {
    const [updatedBooking] = await db
      .update(bookings)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(bookings.id, booking.id))
      .returning({ id: bookings.id, status: bookings.status });

    return NextResponse.json({ ok: true, booking: updatedBooking ?? { id: booking.id, status: "completed" } });
  }

  // Validate transition and then perform booking update + transfer.
  assertTransition(booking.status, "completed");

  const transfer = await stripe.transfers.create({
    amount: earning.netAmount,
    currency: "nzd",
    destination: provider.stripeConnectId,
    transfer_group: booking.id,
    metadata: {
      bookingId: booking.id,
      providerId: provider.id,
    },
  });

  await db
    .update(providerEarnings)
    .set({
      status: "transferred",
      stripeTransferId: transfer.id,
      transferredAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(providerEarnings.id, earning.id));

  const [updatedBooking] = await db
    .update(bookings)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(bookings.id, booking.id))
    .returning({ id: bookings.id, status: bookings.status });

  return NextResponse.json({ ok: true, booking: updatedBooking, transferId: transfer.id });
}
