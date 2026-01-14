import { db } from '@/lib/db';
import { bookings, services, providers, users, providerEarnings } from '@/db/schema';
import { desc, inArray, eq, gte, lte, and, between, sql, ilike } from 'drizzle-orm';

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

export interface FeesSummary {
  year: number;
  totals: {
    totalGross: number;
    totalFee: number;
    totalGst: number;
    totalNet: number;
  };
  monthlyTrend: { month: string; gross: number; fee: number; net: number }[];
}

export interface FeesByProviderRow {
  providerId: string;
  providerName: string | null;
  totalGross: number;
  totalFee: number;
  totalNet: number;
}

export async function getAdminFeesReport({
  from,
  to,
  providerSearch,
}: {
  from: string;
  to: string;
  providerSearch?: string;
}): Promise<FeeReportRow[]> {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999); // End of day

  // Build base conditions
  const baseConditions = [sql`(${bookings.status})::text in ('paid','completed')`];

  // Add date conditions if specified
  baseConditions.push(gte(bookings.updatedAt, fromDate));
  baseConditions.push(lte(bookings.updatedAt, toDate));

  const trimmedSearch = providerSearch?.trim();
  if (trimmedSearch) {
    baseConditions.push(ilike(providers.businessName, `%${trimmedSearch}%`));
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

  return report;
}

const STATUS_ELIGIBLE = ['awaiting_payout', 'paid_out'] as const;

function isMissingTableError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const code = (error as { code?: string }).code;
  const causeCode = (error as { cause?: { code?: string } }).cause?.code;

  return code === '42P01' || causeCode === '42P01';
}

export async function getFeesSummary(year: number): Promise<FeesSummary> {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));

  const totals = await db
    .select({
      totalGross: sql<number>`coalesce(sum(${providerEarnings.grossAmount}), 0)`,
      totalFee: sql<number>`coalesce(sum(${providerEarnings.platformFeeAmount}), 0)`,
      totalGst: sql<number>`coalesce(sum(${providerEarnings.gstAmount}), 0)`,
      totalNet: sql<number>`coalesce(sum(${providerEarnings.netAmount}), 0)`,
    })
    .from(providerEarnings)
    .where(
      and(
        between(providerEarnings.paidAt, start, end),
        inArray(providerEarnings.status, STATUS_ELIGIBLE),
      ),
    )
    .then((rows) => rows[0])
    .catch((error) => {
      if (isMissingTableError(error)) {
        return { totalGross: 0, totalFee: 0, totalGst: 0, totalNet: 0 };
      }
      throw error;
    });

  const monthlyTrend = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${providerEarnings.paidAt}), 'YYYY-MM')`,
      gross: sql<number>`coalesce(sum(${providerEarnings.grossAmount}), 0)`,
      fee: sql<number>`coalesce(sum(${providerEarnings.platformFeeAmount}), 0)`,
      net: sql<number>`coalesce(sum(${providerEarnings.netAmount}), 0)`,
    })
    .from(providerEarnings)
    .where(
      and(
        between(providerEarnings.paidAt, start, end),
        inArray(providerEarnings.status, STATUS_ELIGIBLE),
      ),
    )
    .groupBy(sql`date_trunc('month', ${providerEarnings.paidAt})`)
    .orderBy(sql`date_trunc('month', ${providerEarnings.paidAt})`)
    .catch((error) => {
      if (isMissingTableError(error)) {
        return [] as FeesSummary['monthlyTrend'];
      }
      throw error;
    });

  return {
    year,
    totals,
    monthlyTrend,
  };
}

export async function getFeesByProvider(year: number): Promise<FeesByProviderRow[]> {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));

  const rows = await db
    .select({
      providerId: providerEarnings.providerId,
      providerName: providers.businessName,
      totalGross: sql<number>`coalesce(sum(${providerEarnings.grossAmount}), 0)`,
      totalFee: sql<number>`coalesce(sum(${providerEarnings.platformFeeAmount}), 0)`,
      totalNet: sql<number>`coalesce(sum(${providerEarnings.netAmount}), 0)`,
    })
    .from(providerEarnings)
    .leftJoin(providers, eq(providers.id, providerEarnings.providerId))
    .where(
      and(
        between(providerEarnings.paidAt, start, end),
        inArray(providerEarnings.status, STATUS_ELIGIBLE),
      ),
    )
    .groupBy(providerEarnings.providerId, providers.businessName)
    .orderBy(desc(sql`coalesce(sum(${providerEarnings.platformFeeAmount}), 0)`))
    .catch((error) => {
      if (isMissingTableError(error)) {
        return [] as FeesByProviderRow[];
      }
      throw error;
    });

  return rows;
}