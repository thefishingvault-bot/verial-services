import { db } from '@/lib/db';
import { bookings, services, providers, users } from '@/db/schema';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { desc, inArray, eq } from 'drizzle-orm';

export const runtime = 'nodejs';

// Helper function to check for Admin role
const isAdmin = async (userId: string): Promise<boolean> => {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return user.publicMetadata.role === 'admin';
};

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId || !(await isAdmin(userId))) {
      return new NextResponse('Forbidden: Requires admin role', { status: 403 });
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
      .where(inArray(bookings.status, ['paid', 'completed']))
      .orderBy(desc(bookings.updatedAt));

    // Calculate fees (as per spec: 10% = PLATFORM_FEE_BPS=1000)
    const feeBps = parseInt(process.env.PLATFORM_FEE_BPS || '1000');

    const report = paidBookings.map(b => {
      const platformFee = Math.ceil(b.priceAtBooking * (feeBps / 10000));
      return {
        bookingId: b.id,
        status: b.status,
        paidAt: b.updatedAt, // Assumes updatedAt is set on 'paid' status change
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

