import { db } from '@/lib/db';
import { bookings } from '@/db/schema';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { createNotificationOnce } from '@/lib/notifications';
import { assertTransition } from '@/lib/booking-state';
import { bookingIdempotencyKey, withIdempotency } from '@/lib/idempotency';
import { enforceRateLimit, rateLimitResponse } from '@/lib/rate-limit';

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

    const rate = await enforceRateLimit(req, {
      userId,
      resource: 'bookings:cancel',
      limit: 5,
      windowSeconds: 60,
    });

    if (!rate.success) {
      return rateLimitResponse(rate.retryAfter);
    }

    const idemKey = bookingIdempotencyKey('cancel', userId, bookingId);

    const result = await withIdempotency(idemKey, 6 * 60 * 60, async () => {
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
        throw new Error('NOT_FOUND');
      }

      try {
        assertTransition(booking.status, 'canceled_customer');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid transition';
        throw new Error(message);
      }

      await db
        .update(bookings)
        .set({ status: 'canceled_customer', updatedAt: new Date() })
        .where(eq(bookings.id, bookingId));

      await createNotificationOnce({
        event: 'booking_cancelled_customer',
        bookingId,
        userId: booking.provider.userId,
        payload: {
          message: `Booking canceled by customer: ${booking.service.title}`,
          href: '/dashboard/bookings/provider',
        },
      });

      return { success: true };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API_BOOKING_CANCEL]', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    if (message === 'NOT_FOUND') {
      return new NextResponse('Booking not found or cannot be canceled', { status: 404 });
    }
    if (message === 'Invalid transition') {
      return new NextResponse(message, { status: 400 });
    }
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
