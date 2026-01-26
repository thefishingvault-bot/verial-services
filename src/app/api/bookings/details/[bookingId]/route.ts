import { db } from "@/lib/db";
import { bookings } from "@/db/schema";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { normalizeStatus } from "@/lib/booking-state";
import { asOne } from "@/lib/relations/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { bookingId } = await params;
    if (!bookingId) {
      return new NextResponse("Missing bookingId", { status: 400 });
    }

    // Find the booking, but only if it belongs to this user
    const booking = await db.query.bookings.findFirst({
      where: and(
        eq(bookings.id, bookingId),
        eq(bookings.userId, userId) // Security check
      ),
      with: {
        provider: {
          columns: { stripeConnectId: true },
        },
      },
    });

    if (!booking) {
      return new NextResponse("Booking not found or access denied", { status: 404 });
    }

    // Only allow payment if the booking is 'accepted'
    const normalizedStatus = normalizeStatus(booking.status);
    if (normalizedStatus !== 'accepted') {
      return new NextResponse(`Cannot pay for booking with status: ${booking.status}`, { status: 400 });
    }

    if (!booking.priceAtBooking || booking.priceAtBooking < 100) {
      return new NextResponse('This booking needs a final price from the provider before payment.', { status: 400 });
    }

    const provider = asOne(booking.provider);

    return NextResponse.json({
      bookingId: booking.id,
      amount: booking.priceAtBooking,
      providerStripeId: provider?.stripeConnectId ?? null,
    }, {
      headers: {
        "Cache-Control": "no-store",
      },
    });

  } catch (error) {
    console.error("[API_BOOKING_DETAILS]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

