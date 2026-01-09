import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { bookings } from "@/db/schema";
import { assertTransition, type BookingStatus } from "@/lib/booking-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const { bookingId } = await params;
    if (!bookingId) return new NextResponse("Missing bookingId", { status: 400 });

    const booking = await db.query.bookings.findFirst({
      where: and(eq(bookings.id, bookingId), eq(bookings.userId, userId)),
      columns: {
        id: true,
        status: true,
        paymentIntentId: true,
      },
    });

    if (!booking) return new NextResponse("Booking not found", { status: 404 });

    const current = booking.status as BookingStatus;
    const alreadyPaid = ["paid", "completed", "refunded", "disputed"].includes(current);

    if (!booking.paymentIntentId) {
      return NextResponse.json(
        { ok: true, updated: false, reason: "missing_payment_intent" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const pi = await stripe.paymentIntents.retrieve(booking.paymentIntentId);

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

    if (alreadyPaid) {
      if (booking.paymentIntentId !== pi.id) {
        const rows = await db
          .update(bookings)
          .set({ paymentIntentId: pi.id, updatedAt: new Date() })
          .where(eq(bookings.id, bookingId))
          .returning({ id: bookings.id, status: bookings.status, paymentIntentId: bookings.paymentIntentId });

        console.info("[API_BOOKING_SYNC_PAYMENT] Linked", { bookingId, rows });
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

    return NextResponse.json(
      { ok: true, updated: rows.length > 0, rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[API_BOOKING_SYNC_PAYMENT]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
