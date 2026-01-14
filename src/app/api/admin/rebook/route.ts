import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookings, users, providers, services } from '@/db/schema';
import { eq, desc, inArray, sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/admin-auth';
import { RebookCreateSchema, RebookQuerySchema, invalidResponse, parseBody, parseQuery } from '@/lib/validation/admin';

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const parsedQuery = parseQuery(RebookQuerySchema, request);
    if (!parsedQuery.ok) return invalidResponse(parsedQuery.error);
    const { status, limit } = parsedQuery.data;

    const statusCondition =
      status === 'canceled'
        ? inArray(sql<string>`(${bookings.status})::text`, ['canceled_customer', 'canceled_provider'])
        : eq(bookings.status, status);

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
      .where(statusCondition)
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
        .where(inArray(bookings.id, bookingIds));

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
        .where(inArray(bookings.id, bookingIds));

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
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const parsedBody = await parseBody(RebookCreateSchema, request);
    if (!parsedBody.ok) return invalidResponse(parsedBody.error);
    const { originalBookingId, newScheduledDateTime, reason } = parsedBody.data;

    const parsedScheduled = new Date(newScheduledDateTime);
    if (Number.isNaN(parsedScheduled.getTime())) {
      return NextResponse.json({ error: 'Invalid newScheduledDateTime' }, { status: 400 });
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
      scheduledDate: parsedScheduled,
      priceAtBooking: booking.priceAtBooking,
      status: 'accepted',
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
      message: reason ? `Booking successfully rebooked: ${reason}` : 'Booking successfully rebooked',
    });
  } catch (error) {
    console.error('Error rebooking:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}