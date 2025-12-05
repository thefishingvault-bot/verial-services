import { db } from '@/lib/db';
import { bookings } from '@/db/schema';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { createNotification } from '@/lib/notifications';
import { assertTransition } from '@/lib/booking-state';

export const runtime = 'nodejs';

export async function PATCH(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { bookingId } = await req.json();
    if (!bookingId) {
      return new NextResponse('Missing bookingId', { status: 400 });
    }

    // 1. Verify the booking belongs to the user AND capture current status
    const booking = await db.query.bookings.findFirst({
      where: and(
        eq(bookings.id, bookingId),
        eq(bookings.userId, userId),
      ),
      with: {
        service: { columns: { title: true } },
        provider: { columns: { userId: true } },
      },
    });

    if (!booking) {
      return new NextResponse('Booking not found or cannot be canceled', { status: 404 });
    }

    try {
      assertTransition(booking.status, 'canceled_customer');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid transition';
      return new NextResponse(message, { status: 400 });
    }

    // 2. Update status to 'canceled_customer'
    await db
      .update(bookings)
      .set({ status: 'canceled_customer', updatedAt: new Date() })
      .where(eq(bookings.id, bookingId));

    // 3. Notify the Provider (in-app notification only for MVP)
    await createNotification({
      userId: booking.provider.userId,
      message: `Booking canceled by customer: ${booking.service.title}`,
      href: '/dashboard/bookings/provider',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API_BOOKING_CANCEL]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
