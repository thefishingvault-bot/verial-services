import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, providers, services, bookings } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;
    const { userId } = admin;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'all';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    // For now, we'll simulate fee policy overrides since there's no fee_overrides table
    // In a real implementation, this would query a fee_overrides table

    // Get providers with their current fee structures
    const providersWithFees = await db
      .select({
        providerId: providers.id,
        providerName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
        businessName: providers.businessName,
        providerEmail: users.email,
        trustLevel: providers.trustLevel,
        totalBookings: sql<number>`count(bookings.id)`,
        totalRevenue: sql<number>`sum(bookings.priceAtBooking)`,
        serviceCategories: sql<string>`array_agg(distinct services.category)`,
        createdAt: providers.createdAt,
      })
      .from(providers)
      .leftJoin(users, eq(users.id, providers.userId))
      .leftJoin(services, eq(services.providerId, providers.id))
      .leftJoin(bookings, eq(bookings.providerId, providers.id))
      .groupBy(providers.id, users.firstName, users.lastName, providers.businessName, users.email, providers.trustLevel, providers.createdAt)
      .orderBy(desc(providers.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    // Simulate fee policy overrides (in real implementation, this would come from database)
    const feeOverrides = providersWithFees.map(provider => {
      // Default platform fee is 15%
      const defaultPlatformFee = 15;

      // Simulate some providers having custom fee overrides
      const hasCustomOverride = Math.random() > 0.7; // 30% of providers have overrides
      const customFeeRate = hasCustomOverride ? Math.floor(Math.random() * 10) + 5 : null; // 5-14%

      // Calculate current effective fee
      const effectiveFeeRate = customFeeRate || defaultPlatformFee;

      // Calculate potential savings with override
      const monthlyRevenue = provider.totalRevenue || 0;
      const currentFees = (monthlyRevenue * defaultPlatformFee) / 100;
      const overrideFees = customFeeRate ? (monthlyRevenue * customFeeRate) / 100 : currentFees;
      const monthlySavings = currentFees - overrideFees;

      return {
        providerId: provider.providerId,
        providerName: provider.providerName || 'Unknown Provider',
        businessName: provider.businessName,
        providerEmail: provider.providerEmail || 'unknown@example.com',
        trustLevel: provider.trustLevel,
        serviceCategories: provider.serviceCategories ? provider.serviceCategories.split(',').filter(cat => cat.trim() !== '') : [],
        totalBookings: provider.totalBookings || 0,
        totalRevenue: provider.totalRevenue || 0,
        defaultPlatformFee,
        customFeeRate,
        effectiveFeeRate,
        hasCustomOverride,
        monthlySavings,
        status: hasCustomOverride ? 'active' : 'default',
        createdAt: provider.createdAt,
        lastModified: hasCustomOverride ? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString() : null,
      };
    });

    // Filter by status if specified
    let filteredOverrides = feeOverrides;
    if (status !== 'all') {
      switch (status) {
        case 'active':
          filteredOverrides = feeOverrides.filter(o => o.hasCustomOverride);
          break;
        case 'default':
          filteredOverrides = feeOverrides.filter(o => !o.hasCustomOverride);
          break;
      }
    }

    // Get summary statistics
    const stats = {
      totalProviders: filteredOverrides.length,
      providersWithOverrides: filteredOverrides.filter(o => o.hasCustomOverride).length,
      providersOnDefault: filteredOverrides.filter(o => !o.hasCustomOverride).length,
      totalRevenue: filteredOverrides.reduce((sum, p) => sum + p.totalRevenue, 0),
      totalMonthlyFees: filteredOverrides.reduce((sum, p) => sum + ((p.totalRevenue * p.effectiveFeeRate) / 100), 0),
      totalMonthlySavings: filteredOverrides.reduce((sum, p) => sum + p.monthlySavings, 0),
      avgFeeRate: filteredOverrides.length > 0
        ? filteredOverrides.reduce((sum, p) => sum + p.effectiveFeeRate, 0) / filteredOverrides.length
        : 0,
    };

    return NextResponse.json({
      overrides: filteredOverrides,
      stats,
      pagination: {
        page,
        limit,
        total: filteredOverrides.length,
      },
      filters: {
        status,
      },
    });
  } catch (error) {
    console.error('Error fetching fee policy overrides:', error);
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
    const { userId } = admin;

    const body = await request.json();
    const { providerId, customFeeRate, reason } = body;

    if (!providerId || customFeeRate === undefined) {
      return NextResponse.json(
        { error: 'Provider ID and custom fee rate are required' },
        { status: 400 }
      );
    }

    if (customFeeRate < 0 || customFeeRate > 50) {
      return NextResponse.json(
        { error: 'Fee rate must be between 0% and 50%' },
        { status: 400 }
      );
    }

    // In a real implementation, this would insert/update a fee_overrides table
    // For now, we'll just return success

    return NextResponse.json({
      success: true,
      message: `Fee override set to ${customFeeRate}% for provider ${providerId}`,
      override: {
        providerId,
        customFeeRate,
        reason,
        status: 'active',
        createdBy: userId,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error creating fee policy override:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}