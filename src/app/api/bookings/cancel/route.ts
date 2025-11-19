import { db } from '@/lib/db';
import { bookings, notifications } from '@/db/schema';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';

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

    // Find the booking and verify it belongs to this customer
    const booking = await db.query.bookings.findFirst({
      where: and(
        eq(bookings.id, bookingId),
        eq(bookings.userId, userId) // Security check: user must own the booking
      ),
      with: {
        service: {
          columns: { title: true },
        },
        provider: {
          columns: { userId: true },
        },
      },
    });

    if (!booking) {
      return new NextResponse('Booking not found or access denied', { status: 404 });
    }

    // Only allow canceling 'pending' bookings
    if (booking.status !== 'pending') {
      return new NextResponse(
        `Cannot cancel booking with status '${booking.status}'. Only 'pending' bookings can be canceled.`,
        { status: 400 }
      );
    }

    // Update booking status to 'canceled'
    await db
      .update(bookings)
      .set({
        status: 'canceled',
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, bookingId));

    // Create notification for the provider
    const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await db.insert(notifications).values({
      id: notificationId,
      userId: booking.provider.userId,
      message: `Customer canceled their booking request for "${booking.service.title}"`,
      href: '/dashboard/bookings/provider',
      isRead: false,
    });

    console.log(`[API_BOOKING_CANCEL] Booking ${bookingId} canceled by user ${userId}`);
    return NextResponse.json({ success: true, message: 'Booking canceled successfully' });

  } catch (error) {
    console.error('[API_BOOKING_CANCEL]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
