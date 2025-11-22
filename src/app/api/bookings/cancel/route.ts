import { db } from '@/lib/db';
import { bookings } from '@/db/schema';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { createNotification } from '@/lib/notifications';

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

    // 1. Verify the booking belongs to the user AND is pending
    const booking = await db.query.bookings.findFirst({
      where: and(
        eq(bookings.id, bookingId),
        eq(bookings.userId, userId),
        eq(bookings.status, 'pending'),
      ),
      with: {
        service: { columns: { title: true } },
        provider: { columns: { userId: true } },
      },
    });

    if (!booking) {
      return new NextResponse('Booking not found or cannot be canceled', { status: 404 });
    }

    // 2. Update status to 'canceled'
    await db
      .update(bookings)
      .set({ status: 'canceled', updatedAt: new Date() })
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
