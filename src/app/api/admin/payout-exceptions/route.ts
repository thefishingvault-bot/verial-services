import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { providers, users, bookings, refunds } from '@/db/schema';
import { eq, desc, inArray, sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/admin-auth';
import { PayoutExceptionsQuerySchema, invalidResponse, parseQuery } from '@/lib/validation/admin';

export function getTimeframeStartDate(timeframe: '7d' | '30d' | '90d', now: Date) {
  switch (timeframe) {
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  }
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const parsedQuery = parseQuery(PayoutExceptionsQuerySchema, request);
    if (!parsedQuery.ok) return invalidResponse(parsedQuery.error);
    const { status, timeframe, page, limit } = parsedQuery.data;

    const now = new Date();
    const startDate = getTimeframeStartDate(timeframe, now);

    // Get providers with payout-related issues
    const providersWithIssues = await db
      .select({
        providerId: providers.id,
        providerName: sql<string>`'Provider'`, // Placeholder
        providerEmail: sql<string>`'provider@example.com'`, // Placeholder
        businessName: providers.businessName,
        stripeConnectId: providers.stripeConnectId,
        chargesEnabled: providers.chargesEnabled,
        payoutsEnabled: providers.payoutsEnabled,
        isSuspended: providers.isSuspended,
        trustLevel: providers.trustLevel,
        totalBookings: sql<number>`count(case when ${bookings.createdAt} >= ${startDate} then 1 end)`,
        completedBookings: sql<number>`count(case when ${bookings.status} = 'completed' and ${bookings.createdAt} >= ${startDate} then 1 end)`,
        totalRevenue: sql<number>`sum(case when ${bookings.createdAt} >= ${startDate} then ${bookings.priceAtBooking} else 0 end)`,
        pendingRefunds: sql<number>`count(case when ${refunds.status} = 'pending' and ${refunds.createdAt} >= ${startDate} then 1 end)`,
        failedRefunds: sql<number>`count(case when ${refunds.status} = 'failed' and ${refunds.createdAt} >= ${startDate} then 1 end)`,
        createdAt: providers.createdAt,
      })
      .from(providers)
      .leftJoin(bookings, eq(bookings.providerId, providers.id))
      .leftJoin(refunds, eq(refunds.bookingId, bookings.id))
      .groupBy(providers.id, providers.businessName, providers.stripeConnectId, providers.chargesEnabled, providers.payoutsEnabled, providers.isSuspended, providers.trustLevel, providers.createdAt)
      .orderBy(desc(providers.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    // Get provider details separately
    const providerIds = providersWithIssues.map(p => p.providerId);
    const providerDetails = providerIds.length === 0 ? [] : await db
      .select({
        id: providers.id,
        userId: providers.userId,
        name: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
        email: users.email,
      })
      .from(providers)
      .leftJoin(users, eq(users.id, providers.userId))
      .where(inArray(providers.id, providerIds));

    const providerMap = new Map(
      providerDetails.map(p => [p.id, { name: p.name, email: p.email }])
    );

    // Enrich provider data and identify payout exceptions
    const enrichedProviders = providersWithIssues.map(provider => {
      const providerInfo = providerMap.get(provider.providerId);
      const totalRevenue = provider.totalRevenue || 0;
      const pendingRefunds = provider.pendingRefunds || 0;
      const failedRefunds = provider.failedRefunds || 0;

      // Determine payout exception types
      const exceptions = [];

      if (!provider.stripeConnectId) {
        exceptions.push('no_stripe_connect');
      } else if (provider.chargesEnabled && !provider.payoutsEnabled) {
        exceptions.push('payouts_disabled');
      }

      if (provider.isSuspended) {
        exceptions.push('provider_suspended');
      }

      if (pendingRefunds > 0) {
        exceptions.push('pending_refunds');
      }

      if (failedRefunds > 0) {
        exceptions.push('failed_refunds');
      }

      if (totalRevenue > 0 && exceptions.length === 0) {
        exceptions.push('ready_for_payout');
      }

      return {
        ...provider,
        providerName: providerInfo?.name || 'Unknown Provider',
        providerEmail: providerInfo?.email || 'unknown@example.com',
        totalRevenue,
        pendingRefunds,
        failedRefunds,
        exceptions,
        isException: exceptions.length > 0 && !exceptions.includes('ready_for_payout'),
        needsReview: exceptions.some(e => ['payouts_disabled', 'failed_refunds', 'pending_refunds'].includes(e)),
        isHighValue: totalRevenue > 50000, // High value threshold ($500+)
        payoutStatus: provider.payoutsEnabled ? 'enabled' : (provider.stripeConnectId ? 'disabled' : 'not_connected'),
      };
    });

    // Filter by status if specified
    let filteredProviders = enrichedProviders;
    if (status !== 'all') {
      switch (status) {
        case 'exceptions':
          filteredProviders = enrichedProviders.filter(p => p.isException);
          break;
        case 'ready':
          filteredProviders = enrichedProviders.filter(p => p.exceptions.includes('ready_for_payout'));
          break;
        case 'disabled':
          filteredProviders = enrichedProviders.filter(p => p.payoutStatus === 'disabled');
          break;
        case 'not_connected':
          filteredProviders = enrichedProviders.filter(p => p.payoutStatus === 'not_connected');
          break;
      }
    }

    // Get summary statistics
    const stats = {
      totalProviders: filteredProviders.length,
      providersWithExceptions: filteredProviders.filter(p => p.isException).length,
      providersReadyForPayout: filteredProviders.filter(p => p.exceptions.includes('ready_for_payout')).length,
      providersWithPayoutsDisabled: filteredProviders.filter(p => p.payoutStatus === 'disabled').length,
      providersNotConnected: filteredProviders.filter(p => p.payoutStatus === 'not_connected').length,
      suspendedProviders: filteredProviders.filter(p => p.isSuspended).length,
      highValueProviders: filteredProviders.filter(p => p.isHighValue).length,
      totalPendingRefunds: filteredProviders.reduce((sum, p) => sum + p.pendingRefunds, 0),
      totalFailedRefunds: filteredProviders.reduce((sum, p) => sum + p.failedRefunds, 0),
      totalRevenue: filteredProviders.reduce((sum, p) => sum + p.totalRevenue, 0),
    };

    return NextResponse.json({
      providers: filteredProviders,
      stats,
      pagination: {
        page,
        limit,
        total: filteredProviders.length,
      },
      filters: {
        status,
        timeframe,
      },
    });
  } catch (error) {
    console.error('Error fetching payout exceptions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}