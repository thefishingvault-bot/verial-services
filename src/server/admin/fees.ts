import { db } from '@/lib/db';
import { bookings, services, providers, users } from '@/db/schema';
import { desc, inArray, eq, gte, lte, and } from 'drizzle-orm';

export interface FeeReportRow {
  bookingId: string;
  status: string;
  paidAt: string;
  serviceTitle: string;
  providerName: string;
  customerEmail: string;
  totalAmount: number;
  platformFee: number;
}

export async function getAdminFeesReport({ from, to }: { from: string; to: string }): Promise<FeeReportRow[]> {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999); // End of day

  // Build base conditions
  const baseConditions = [inArray(bookings.status, ['paid', 'completed'])];

  // Add date conditions if specified
  baseConditions.push(gte(bookings.updatedAt, fromDate));
  baseConditions.push(lte(bookings.updatedAt, toDate));

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

  return report;
}