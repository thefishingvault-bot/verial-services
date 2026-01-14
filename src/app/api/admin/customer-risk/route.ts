import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, bookings, reviews, disputes } from '@/db/schema';
import { eq, desc, and, gte, inArray, sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/admin-auth';
import { CustomerRiskQuerySchema, invalidResponse, parseQuery } from '@/lib/validation/admin';

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

    const parsedQuery = parseQuery(CustomerRiskQuerySchema, request);
    if (!parsedQuery.ok) return invalidResponse(parsedQuery.error);
    const { timeframe, riskLevel: riskLevelFilter, limit } = parsedQuery.data;

    const now = new Date();
    const startDate = getTimeframeStartDate(timeframe, now);

    // Get customer risk signals
    const customerRiskData = await db
      .select({
        customerId: bookings.userId,
        customerName: sql<string>`'Customer'`, // Placeholder - will be resolved separately
        customerEmail: sql<string>`'customer@example.com'`, // Placeholder
        totalBookings: sql<number>`count(bookings.id)`,
        completedBookings: sql<number>`count(case when bookings.status = 'completed' then 1 end)`,
        cancelledBookings: sql<number>`count(case when bookings.status = 'canceled' then 1 end)`,
        pendingBookings: sql<number>`count(case when bookings.status = 'pending' then 1 end)`,
        confirmedBookings: sql<number>`count(case when bookings.status = 'accepted' then 1 end)`,
        paidBookings: sql<number>`count(case when bookings.status = 'paid' then 1 end)`,
        totalSpent: sql<number>`sum(bookings.priceAtBooking)`,
        avgBookingValue: sql<number>`avg(bookings.priceAtBooking)`,
        lastBookingDate: sql<string>`max(bookings.createdAt)`,
        firstBookingDate: sql<string>`min(bookings.createdAt)`,
        // Risk indicators
        cancellationRate: sql<number>`(count(case when bookings.status = 'canceled' then 1 end) * 100.0) / count(bookings.id)`,
        bookingFrequency: sql<number>`count(bookings.id) * 1.0 / greatest(1, extract(epoch from (max(bookings.createdAt) - min(bookings.createdAt))) / (24 * 60 * 60))`,
        // Reviews and disputes
        totalReviews: sql<number>`count(distinct reviews.id)`,
        avgRating: sql<number>`avg(reviews.rating)`,
        totalDisputes: sql<number>`count(distinct disputes.id)`,
        // Account age in days
        accountAge: sql<number>`extract(epoch from (now() - users.createdAt)) / (24 * 60 * 60)`,
      })
      .from(bookings)
      .leftJoin(users, eq(bookings.userId, users.id))
      .leftJoin(reviews, and(eq(reviews.userId, bookings.userId), eq(reviews.providerId, bookings.providerId)))
      .leftJoin(disputes, eq(disputes.bookingId, bookings.id))
      .where(gte(bookings.createdAt, startDate))
      .groupBy(bookings.userId, users.email, users.firstName, users.lastName, users.createdAt)
      .orderBy(desc(sql<number>`count(bookings.id)`))
      .limit(limit);

    // Get customer names separately
    const customerIds = customerRiskData.map(c => c.customerId);
    const customerNames: Record<string, { name: string; email: string; accountAge: number }> = {};

    if (customerIds.length > 0) {
      const customers = await db
        .select({
          id: users.id,
          name: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
          email: users.email,
          accountAge: sql<number>`extract(epoch from (now() - ${users.createdAt})) / (24 * 60 * 60)`,
        })
        .from(users)
        .where(inArray(users.id, customerIds));

      customers.forEach(c => {
        customerNames[c.id] = { name: c.name || 'Unknown', email: c.email || 'unknown@example.com', accountAge: c.accountAge || 0 };
      });
    }

    // Calculate risk scores and combine with enriched data
    const enrichedCustomers = customerRiskData.map(customer => {
      const cancellationRate = customer.cancellationRate || 0;
      const bookingFrequency = customer.bookingFrequency || 0;
      const avgRating = customer.avgRating || 0;
      const totalDisputes = customer.totalDisputes || 0;
      const accountAge = customerNames[customer.customerId]?.accountAge || 0;

      // Risk scoring algorithm
      let riskScore = 0;

      // High cancellation rate (>30%) = high risk
      if (cancellationRate > 30) riskScore += 30;
      else if (cancellationRate > 15) riskScore += 15;

      // Very frequent bookings (>2 per week) = medium risk
      if (bookingFrequency > 2) riskScore += 20;

      // Low ratings (<3.5 average) = medium risk
      if (avgRating > 0 && avgRating < 3.5) riskScore += 15;

      // Any disputes = medium risk
      if (totalDisputes > 0) riskScore += 10;

      // New accounts (<30 days) = low risk boost
      if (accountAge < 30) riskScore += 5;

      // Very new accounts (<7 days) = higher risk
      if (accountAge < 7) riskScore += 10;

      // Determine risk level
      let riskLevel: 'low' | 'medium' | 'high';
      if (riskScore >= 40) riskLevel = 'high';
      else if (riskScore >= 20) riskLevel = 'medium';
      else riskLevel = 'low';

      return {
        ...customer,
        customerName: customerNames[customer.customerId]?.name || 'Unknown Customer',
        customerEmail: customerNames[customer.customerId]?.email || 'unknown@example.com',
        accountAge,
        riskScore,
        riskLevel,
        riskFactors: {
          highCancellationRate: cancellationRate > 30,
          frequentBookings: bookingFrequency > 2,
          lowRatings: avgRating > 0 && avgRating < 3.5,
          hasDisputes: totalDisputes > 0,
          newAccount: accountAge < 30,
          veryNewAccount: accountAge < 7,
        },
      };
    });

    // Filter by risk level if specified
    const filteredCustomers = riskLevelFilter === 'all'
      ? enrichedCustomers
      : enrichedCustomers.filter(c => c.riskLevel === riskLevelFilter);

    // Get summary statistics
    const denom = Math.max(1, filteredCustomers.length);
    const stats = {
      totalCustomers: filteredCustomers.length,
      highRiskCustomers: filteredCustomers.filter(c => c.riskLevel === 'high').length,
      mediumRiskCustomers: filteredCustomers.filter(c => c.riskLevel === 'medium').length,
      lowRiskCustomers: filteredCustomers.filter(c => c.riskLevel === 'low').length,
      avgCancellationRate: filteredCustomers.reduce((sum, c) => sum + (c.cancellationRate || 0), 0) / denom,
      totalDisputes: filteredCustomers.reduce((sum, c) => sum + (c.totalDisputes || 0), 0),
      avgBookingValue: filteredCustomers.reduce((sum, c) => sum + (c.avgBookingValue || 0), 0) / denom,
    };

    return NextResponse.json({
      customers: filteredCustomers,
      stats,
      timeframe,
      riskLevel: riskLevelFilter,
    });
  } catch (error) {
    console.error('Error fetching customer risk signals:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}