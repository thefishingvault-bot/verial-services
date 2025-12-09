import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { providers, services, bookings, refunds, users } from '@/db/schema';
import { and, gte, lte, desc, sql, eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get('timeframe') || '30d';
    const groupBy = searchParams.get('groupBy') || 'day';

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    switch (timeframe) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Revenue trends over time
    const revenueTrends = await db
      .select({
        period: sql<string>`date_trunc(${groupBy}, bookings.created_at)`,
        totalRevenue: sql<number>`sum(bookings.price_at_booking)`,
        bookingCount: sql<number>`count(bookings.id)`,
        avgBookingValue: sql<number>`avg(bookings.price_at_booking)`,
        platformFees: sql<number>`sum(bookings.price_at_booking * 0.15)`, // Assuming 15% platform fee
        refunds: sql<number>`coalesce(sum(refunds.amount), 0)`,
      })
      .from(bookings)
      .leftJoin(refunds, eq(refunds.bookingId, bookings.id))
      .where(gte(bookings.createdAt, startDate))
      .groupBy(sql`date_trunc(${groupBy}, bookings.created_at)`)
      .orderBy(sql`date_trunc(${groupBy}, bookings.created_at)`);

    // Revenue by service category
    const revenueByCategory = await db
      .select({
        category: services.category,
        totalRevenue: sql<number>`sum(bookings.price_at_booking)`,
        bookingCount: sql<number>`count(bookings.id)`,
        avgBookingValue: sql<number>`avg(bookings.price_at_booking)`,
        platformFees: sql<number>`sum(bookings.price_at_booking * 0.15)`,
      })
      .from(bookings)
      .leftJoin(services, eq(services.id, bookings.serviceId))
      .where(gte(bookings.createdAt, startDate))
      .groupBy(services.category)
      .orderBy(desc(sql`sum(bookings.price_at_booking)`));

    // Revenue by provider
    const revenueByProvider = await db
      .select({
        providerId: providers.id,
        providerName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
        businessName: providers.businessName,
        trustLevel: providers.trustLevel,
        totalRevenue: sql<number>`sum(bookings.price_at_booking)`,
        bookingCount: sql<number>`count(bookings.id)`,
        avgBookingValue: sql<number>`avg(bookings.price_at_booking)`,
        platformFees: sql<number>`sum(bookings.price_at_booking * 0.15)`,
        refunds: sql<number>`coalesce(sum(refunds.amount), 0)`,
      })
      .from(bookings)
      .leftJoin(providers, eq(providers.id, bookings.providerId))
      .leftJoin(users, eq(users.id, providers.userId))
      .leftJoin(refunds, eq(refunds.bookingId, bookings.id))
      .where(gte(bookings.createdAt, startDate))
      .groupBy(providers.id, users.firstName, users.lastName, providers.businessName, providers.trustLevel)
      .orderBy(desc(sql`sum(bookings.price_at_booking)`))
      .limit(20); // Top 20 providers

    // Geographic revenue distribution (by region)
    const revenueByRegion = await db
      .select({
        region: providers.baseRegion,
        totalRevenue: sql<number>`sum(bookings.price_at_booking)`,
        bookingCount: sql<number>`count(bookings.id)`,
        providerCount: sql<number>`count(distinct providers.id)`,
        avgBookingValue: sql<number>`avg(bookings.price_at_booking)`,
      })
      .from(bookings)
      .leftJoin(providers, eq(providers.id, bookings.providerId))
      .where(and(
        gte(bookings.createdAt, startDate),
        sql`${providers.baseRegion} is not null`
      ))
      .groupBy(providers.baseRegion)
      .orderBy(desc(sql`sum(bookings.price_at_booking)`));

    // Overall statistics
    const overallStats = await db
      .select({
        totalRevenue: sql<number>`sum(bookings.price_at_booking)`,
        totalBookings: sql<number>`count(bookings.id)`,
        avgBookingValue: sql<number>`avg(bookings.price_at_booking)`,
        totalPlatformFees: sql<number>`sum(bookings.price_at_booking * 0.15)`,
        totalRefunds: sql<number>`coalesce(sum(refunds.amount), 0)`,
        uniqueCustomers: sql<number>`count(distinct bookings.user_id)`,
        uniqueProviders: sql<number>`count(distinct bookings.provider_id)`,
      })
      .from(bookings)
      .leftJoin(refunds, eq(refunds.bookingId, bookings.id))
      .where(gte(bookings.createdAt, startDate));

    // Calculate growth metrics (compare with previous period)
    const previousPeriodStart = new Date(startDate.getTime() - (startDate.getTime() - (timeframe === '7d' ? new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).getTime() :
      timeframe === '30d' ? new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).getTime() :
      timeframe === '90d' ? new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).getTime() :
      new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000).getTime())));

    const previousPeriodStats = await db
      .select({
        totalRevenue: sql<number>`sum(bookings.price_at_booking)`,
        totalBookings: sql<number>`count(bookings.id)`,
      })
      .from(bookings)
      .where(and(
        gte(bookings.createdAt, previousPeriodStart),
        lte(bookings.createdAt, startDate)
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