import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { providers, users, bookings, refunds } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'all';
    const timeframe = searchParams.get('timeframe') || '30d';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

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
        totalBookings: sql<number>`count(bookings.id)`,
        completedBookings: sql<number>`count(case when bookings.status = 'completed' then 1 end)`,
        totalRevenue: sql<number>`sum(bookings.priceAtBooking)`,
        pendingRefunds: sql<number>`count(case when refunds.status = 'pending' then 1 end)`,
        failedRefunds: sql<number>`count(case when refunds.status = 'failed' then 1 end)`,
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
    const providerDetails = await db
      .select({
        id: providers.id,
        userId: providers.userId,
        name: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
        email: users.email,
      })
      .from(providers)
      .leftJoin(users, eq(users.id, providers.userId))
      .where(sql`${providers.id} = any(${providerIds})`);

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