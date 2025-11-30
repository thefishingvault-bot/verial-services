import { db } from '@/lib/db';
import { bookings, services, providers, users } from '@/db/schema';
import { currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { desc, inArray, eq, gte, lte, and } from 'drizzle-orm';
import { requireAdmin } from '@/lib/admin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  console.log('[API_ADMIN_FEES_REPORT] Request received:', request.url);
  try {
    const user = await currentUser();
    if (!user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    await requireAdmin(user.id);

    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    // Build base conditions
    const baseConditions = [inArray(bookings.status, ['paid', 'completed'])];

    // Add date conditions if specified
    if (fromParam) {
      const fromDate = new Date(fromParam);
      baseConditions.push(gte(bookings.updatedAt, fromDate));
    }
    if (toParam) {
      const toDate = new Date(toParam);
      toDate.setHours(23, 59, 59, 999); // End of day
      baseConditions.push(lte(bookings.updatedAt, toDate));
    }

    // Fetch all bookings that have been paid or completed with manual joins
    const paidBookings = await db
      .select({
        id: bookings.id,
        status: bookings.status,
        updatedAt: bookings.updatedAt,
        priceAtBooking: bookings.priceAtBooking,
        serviceTitle: services.title,
        providerName: providers.businessName,
        customerEmail: users.email,
      })
      .from(bookings)
      .innerJoin(services, eq(bookings.serviceId, services.id))
      .innerJoin(providers, eq(bookings.providerId, providers.id))
      .innerJoin(users, eq(bookings.userId, users.id))
      .where(and(...baseConditions))
      .orderBy(desc(bookings.updatedAt));

    // Calculate fees (as per spec: 10% = PLATFORM_FEE_BPS=1000)
    const feeBps = parseInt(process.env.PLATFORM_FEE_BPS || '1000');

    const report = paidBookings.map(b => {
      const platformFee = Math.ceil(b.priceAtBooking * (feeBps / 10000));
      return {
        bookingId: b.id,
        status: b.status,
        paidAt: b.updatedAt.toISOString(), // Assumes updatedAt is set on 'paid' status change
        serviceTitle: b.serviceTitle,
        providerName: b.providerName,
        customerEmail: b.customerEmail,
        totalAmount: b.priceAtBooking,
        platformFee: platformFee,
      };
    });

    return NextResponse.json(report);

  } catch (error) {
    console.error('[API_ADMIN_FEES_REPORT]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

