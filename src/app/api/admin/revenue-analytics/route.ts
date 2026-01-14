import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { providers, services, bookings, refunds, users } from '@/db/schema';
import { and, gte, lt, desc, sql, eq, inArray } from 'drizzle-orm';
import { requireAdmin } from '@/lib/admin-auth';
import { invalidResponse, parseQuery, RevenueAnalyticsQuerySchema } from '@/lib/validation/admin';

const GROUP_BY_TO_DATE_TRUNC = {
  day: 'day',
  week: 'week',
  month: 'month',
} as const;

const REVENUE_BOOKING_STATUSES = [
  'paid',
  'completed_by_provider',
  'completed',
  'disputed',
  'refunded',
] as const;

const PLATFORM_FEE_BPS = Number.parseInt(process.env.PLATFORM_FEE_BPS || '1000', 10);

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const queryResult = parseQuery(RevenueAnalyticsQuerySchema, request);
    if (!queryResult.ok) return invalidResponse(queryResult.error);

    const { timeframe, groupBy } = queryResult.data;

    // Calculate date range
    const now = new Date();

    const DAY_MS = 24 * 60 * 60 * 1000;
    const timeframeDays = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : timeframe === '90d' ? 90 : 365;
    const periodMs = timeframeDays * DAY_MS;
    const startDate = new Date(now.getTime() - periodMs);

    const dateTruncUnit = GROUP_BY_TO_DATE_TRUNC[groupBy];
    // IMPORTANT: do not pass groupBy directly into date_trunc
    const periodExpr = sql<string>`date_trunc(${sql.raw(`'${dateTruncUnit}'`)}, ${bookings.createdAt})`;
    const platformFeeExpr = sql<number>`sum(ceil(${bookings.priceAtBooking}::numeric * ${PLATFORM_FEE_BPS} / 10000))`;

    const refundsAgg = db
      .select({
        bookingId: refunds.bookingId,
        totalRefunded: sql<number>`coalesce(sum(${refunds.amount}), 0)`.as('totalRefunded'),
      })
      .from(refunds)
      .groupBy(refunds.bookingId)
      .as('refunds_agg');

    const refundsExpr = sql<number>`coalesce(${refundsAgg.totalRefunded}, 0)`;
    const baseBookingWhere = and(
      gte(bookings.createdAt, startDate),
      inArray(bookings.status, [...REVENUE_BOOKING_STATUSES]),
    );

    // Revenue trends over time
    const revenueTrends = await db
      .select({
        period: periodExpr,
        totalRevenue: sql<number>`sum(${bookings.priceAtBooking})`,
        bookingCount: sql<number>`count(${bookings.id})`,
        avgBookingValue: sql<number>`avg(${bookings.priceAtBooking})`,
        platformFees: platformFeeExpr,
        refunds: refundsExpr,
      })
      .from(bookings)
      .leftJoin(refundsAgg, eq(refundsAgg.bookingId, bookings.id))
      .where(baseBookingWhere)
      .groupBy(periodExpr)
      .orderBy(periodExpr);

    // Revenue by service category
    const revenueByCategory = await db
      .select({
        category: services.category,
        totalRevenue: sql<number>`sum(${bookings.priceAtBooking})`,
        bookingCount: sql<number>`count(${bookings.id})`,
        avgBookingValue: sql<number>`avg(${bookings.priceAtBooking})`,
        platformFees: platformFeeExpr,
      })
      .from(bookings)
      .leftJoin(services, eq(services.id, bookings.serviceId))
      .where(baseBookingWhere)
      .groupBy(services.category)
      .orderBy(desc(sql`sum(${bookings.priceAtBooking})`));

    // Revenue by provider
    const revenueByProvider = await db
      .select({
        providerId: providers.id,
        providerName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
        businessName: providers.businessName,
        trustLevel: providers.trustLevel,
        totalRevenue: sql<number>`sum(${bookings.priceAtBooking})`,
        bookingCount: sql<number>`count(${bookings.id})`,
        avgBookingValue: sql<number>`avg(${bookings.priceAtBooking})`,
        platformFees: platformFeeExpr,
        refunds: refundsExpr,
      })
      .from(bookings)
      .leftJoin(providers, eq(providers.id, bookings.providerId))
      .leftJoin(users, eq(users.id, providers.userId))
      .leftJoin(refundsAgg, eq(refundsAgg.bookingId, bookings.id))
      .where(baseBookingWhere)
      .groupBy(providers.id, users.firstName, users.lastName, providers.businessName, providers.trustLevel)
      .orderBy(desc(sql`sum(${bookings.priceAtBooking})`))
      .limit(20); // Top 20 providers

    // Geographic revenue distribution (by region)
    const revenueByRegion = await db
      .select({
        region: providers.baseRegion,
        totalRevenue: sql<number>`sum(${bookings.priceAtBooking})`,
        bookingCount: sql<number>`count(${bookings.id})`,
        providerCount: sql<number>`count(distinct providers.id)`,
        avgBookingValue: sql<number>`avg(${bookings.priceAtBooking})`,
      })
      .from(bookings)
      .leftJoin(providers, eq(providers.id, bookings.providerId))
      .where(and(baseBookingWhere, sql`${providers.baseRegion} is not null`))
      .groupBy(providers.baseRegion)
      .orderBy(desc(sql`sum(${bookings.priceAtBooking})`));

    // Overall statistics
    const overallStats = await db
      .select({
        totalRevenue: sql<number>`sum(${bookings.priceAtBooking})`,
        totalBookings: sql<number>`count(${bookings.id})`,
        avgBookingValue: sql<number>`avg(${bookings.priceAtBooking})`,
        totalPlatformFees: platformFeeExpr,
        totalRefunds: refundsExpr,
        uniqueCustomers: sql<number>`count(distinct ${bookings.userId})`,
        uniqueProviders: sql<number>`count(distinct ${bookings.providerId})`,
      })
      .from(bookings)
      .leftJoin(refundsAgg, eq(refundsAgg.bookingId, bookings.id))
      .where(baseBookingWhere);

    // Calculate growth metrics (compare with previous period)
    const previousPeriodStart = new Date(now.getTime() - 2 * periodMs);

    const previousPeriodStats = await db
      .select({
        totalRevenue: sql<number>`sum(${bookings.priceAtBooking})`,
        totalBookings: sql<number>`count(${bookings.id})`,
      })
      .from(bookings)
      .where(and(
        gte(bookings.createdAt, previousPeriodStart),
        lt(bookings.createdAt, startDate),
        inArray(bookings.status, [...REVENUE_BOOKING_STATUSES]),
      ));

    const currentRevenue = overallStats[0]?.totalRevenue || 0;
    const previousRevenue = previousPeriodStats[0]?.totalRevenue || 0;
    const revenueGrowth = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;

    const currentBookings = overallStats[0]?.totalBookings || 0;
    const previousBookings = previousPeriodStats[0]?.totalBookings || 0;
    const bookingGrowth = previousBookings > 0 ? ((currentBookings - previousBookings) / previousBookings) * 100 : 0;

    return NextResponse.json({
      timeframe,
      groupBy,
      overallStats: {
        totalRevenue: overallStats[0]?.totalRevenue || 0,
        totalBookings: overallStats[0]?.totalBookings || 0,
        avgBookingValue: overallStats[0]?.avgBookingValue || 0,
        totalPlatformFees: overallStats[0]?.totalPlatformFees || 0,
        totalRefunds: overallStats[0]?.totalRefunds || 0,
        netRevenue: (overallStats[0]?.totalPlatformFees || 0) - (overallStats[0]?.totalRefunds || 0),
        uniqueCustomers: overallStats[0]?.uniqueCustomers || 0,
        uniqueProviders: overallStats[0]?.uniqueProviders || 0,
        revenueGrowth,
        bookingGrowth,
      },
      revenueTrends: revenueTrends.map(trend => ({
        ...trend,
        period: trend.period as string, // Already formatted by SQL date_trunc
        netRevenue: trend.platformFees - trend.refunds,
      })),
      revenueByCategory,
      revenueByProvider: revenueByProvider.map(provider => ({
        ...provider,
        netRevenue: provider.platformFees - provider.refunds,
      })),
      revenueByRegion,
    });
  } catch (error) {
    console.error('Error fetching revenue analytics:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}