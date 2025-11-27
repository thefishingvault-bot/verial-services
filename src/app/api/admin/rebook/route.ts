import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { bookings, users, providers, services } from '@/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user[0] || user[0].role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'canceled';
    const limit = parseInt(searchParams.get('limit') || '50');

    // Get cancelled bookings with customer and provider info
    const cancelledBookings = await db
      .select({
        id: bookings.id,
        status: bookings.status,
        scheduledDate: bookings.scheduledDate,
        totalAmount: bookings.priceAtBooking,
        customerId: bookings.userId,
        providerId: bookings.providerId,
        providerHandle: providers.handle,
        serviceId: bookings.serviceId,
        serviceName: services.title,
        serviceCategory: services.category,
        createdAt: bookings.createdAt,
        cancelledAt: bookings.updatedAt,
      })
      .from(bookings)
      .leftJoin(providers, eq(bookings.providerId, providers.id))
      .leftJoin(services, eq(bookings.serviceId, services.id))
      .where(eq(bookings.status, status as any))
      .orderBy(desc(bookings.updatedAt))
      .limit(limit);

    // Get customer and provider names separately
    const bookingIds = cancelledBookings.map(b => b.id);
    const customerNames: Record<string, { name: string; email: string }> = {};
    const providerNames: Record<string, string> = {};

    if (bookingIds.length > 0) {
      // Get customer info
      const customers = await db
        .select({
          bookingId: bookings.id,
          name: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
          email: users.email,
        })
        .from(bookings)
        .leftJoin(users, eq(bookings.userId, users.id))
        .where(sql`${bookings.id} IN (${bookingIds.map(id => `'${id}'`).join(',')})`);

      customers.forEach(c => {
        customerNames[c.bookingId] = { name: c.name || 'Unknown', email: c.email || 'unknown@example.com' };
      });

      // Get provider info
      const providersInfo = await db
        .select({
          bookingId: bookings.id,
          name: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
        })
        .from(bookings)
        .leftJoin(providers, eq(bookings.providerId, providers.id))
        .leftJoin(users, eq(providers.userId, users.id))
        .where(sql`${bookings.id} IN (${bookingIds.map(id => `'${id}'`).join(',')})`);

      providersInfo.forEach(p => {
        providerNames[p.bookingId] = p.name || 'Unknown';
      });
    }

    // Combine the data
    const enrichedBookings = cancelledBookings.map(booking => ({
      ...booking,
      customerName: customerNames[booking.id]?.name || 'Unknown Customer',
      customerEmail: customerNames[booking.id]?.email || 'unknown@example.com',
      providerName: providerNames[booking.id] || 'Unknown Provider',
    }));

    return NextResponse.json({
      cancelledBookings: enrichedBookings,
      total: enrichedBookings.length,
    });
  } catch (error) {
    console.error('Error fetching cancelled bookings:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user[0] || user[0].role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { originalBookingId, newScheduledDateTime, reason } = body;

    if (!originalBookingId || !newScheduledDateTime) {
      return NextResponse.json(
        { error: 'Missing required fields: originalBookingId, newScheduledDateTime' },
        { status: 400 }
      );
    }

    // Get the original booking details
    const originalBooking = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, originalBookingId))
      .limit(1);

    if (!originalBooking[0]) {
      return NextResponse.json(
        { error: 'Original booking not found' },
        { status: 404 }
      );
    }

    const booking = originalBooking[0];

    // Create new booking with same details but new date/time
    const newBookingId = `booking_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await db.insert(bookings).values({
      id: newBookingId,
      userId: booking.userId,
      providerId: booking.providerId,
      serviceId: booking.serviceId,
      scheduledDate: new Date(newScheduledDateTime),
      priceAtBooking: booking.priceAtBooking,
      status: 'confirmed',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Update original booking to link to rebooked one (just update timestamp)
    await db
      .update(bookings)
      .set({
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, originalBookingId));

    return NextResponse.json({
      success: true,
      newBookingId,
      message: 'Booking successfully rebooked',
    });
  } catch (error) {
    console.error('Error rebooking:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}