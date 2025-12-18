import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers, users, services, bookings, reviews, trustIncidents, providerSuspensions, disputes, refunds, riskRules } from "@/db/schema";
import { eq, sql, inArray, and } from "drizzle-orm";
import { RiskScoringEngine } from "@/lib/risk-scoring";
import { requireAdmin } from "@/lib/admin-auth";

type SortOption = "bookings" | "cancellations" | "reviews" | "trust" | "risk" | "created";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const { searchParams } = new URL(request.url);
    const sortBy = (searchParams.get("sort") as SortOption) || "risk";
    const sortOrder = searchParams.get("order") === "asc" ? "asc" : "desc";
    const riskFilter = searchParams.get("risk") || "all";
    const statusFilter = searchParams.get("status") || "all";
    const incidentsFilter = searchParams.get("incidents") || "all";

    // Date ranges for trends
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Get all enabled risk rules for reference
    const enabledRiskRules = await db
      .select({
        id: riskRules.id,
        name: riskRules.name,
        incidentType: riskRules.incidentType,
        severity: riskRules.severity,
        trustScorePenalty: riskRules.trustScorePenalty,
        autoSuspend: riskRules.autoSuspend,
        suspendDurationDays: riskRules.suspendDurationDays,
      })
      .from(riskRules)
      .where(eq(riskRules.enabled, true));

    // Base provider list (no joins that multiply rows)
    const baseProviders = await db
      .select({
        id: providers.id,
        businessName: providers.businessName,
        handle: providers.handle,
        status: providers.status,
        trustLevel: providers.trustLevel,
        trustScore: providers.trustScore,
        createdAt: providers.createdAt,
        userEmail: users.email,
        userFirstName: users.firstName,
        userLastName: users.lastName,
      })
      .from(providers)
      .leftJoin(users, eq(providers.userId, users.id));

    const allProviderIds = baseProviders.map((p) => p.id);

    const bookingsAgg = allProviderIds.length === 0 ? [] : await db
      .select({
        providerId: bookings.providerId,
        totalBookings: sql<number>`cast(count(*) as int)`,
        completedBookings: sql<number>`cast(count(case when ${bookings.status} = 'completed' then 1 end) as int)`,
        cancelledBookings: sql<number>`cast(count(case when ${bookings.status} = 'canceled' then 1 end) as int)`,

        bookings30d: sql<number>`cast(count(case when ${bookings.createdAt} >= ${thirtyDaysAgo} then 1 end) as int)`,
        completed30d: sql<number>`cast(count(case when ${bookings.status} = 'completed' and ${bookings.createdAt} >= ${thirtyDaysAgo} then 1 end) as int)`,
        cancelled30d: sql<number>`cast(count(case when ${bookings.status} = 'canceled' and ${bookings.createdAt} >= ${thirtyDaysAgo} then 1 end) as int)`,

        bookings90d: sql<number>`cast(count(case when ${bookings.createdAt} >= ${ninetyDaysAgo} then 1 end) as int)`,
        completed90d: sql<number>`cast(count(case when ${bookings.status} = 'completed' and ${bookings.createdAt} >= ${ninetyDaysAgo} then 1 end) as int)`,
        cancelled90d: sql<number>`cast(count(case when ${bookings.status} = 'canceled' and ${bookings.createdAt} >= ${ninetyDaysAgo} then 1 end) as int)`,
      })
      .from(bookings)
      .where(inArray(bookings.providerId, allProviderIds))
      .groupBy(bookings.providerId);

    const reviewsAgg = allProviderIds.length === 0 ? [] : await db
      .select({
        providerId: reviews.providerId,
        totalReviews: sql<number>`cast(count(*) as int)`,
        avgRating: sql<number>`cast(avg(${reviews.rating}) as float)`,
      })
      .from(reviews)
      .where(inArray(reviews.providerId, allProviderIds))
      .groupBy(reviews.providerId);

    const incidentsAgg = allProviderIds.length === 0 ? [] : await db
      .select({
        providerId: trustIncidents.providerId,
        totalIncidents: sql<number>`cast(count(*) as int)`,
        unresolvedIncidents: sql<number>`cast(count(case when ${trustIncidents.resolved} = false then 1 end) as int)`,
        recentIncidents: sql<number>`cast(count(case when ${trustIncidents.createdAt} >= ${thirtyDaysAgo} then 1 end) as int)`,
      })
      .from(trustIncidents)
      .where(inArray(trustIncidents.providerId, allProviderIds))
      .groupBy(trustIncidents.providerId);

    const suspensionsAgg = allProviderIds.length === 0 ? [] : await db
      .select({
        providerId: providerSuspensions.providerId,
        totalSuspensions: sql<number>`cast(count(*) as int)`,
        activeSuspensions: sql<number>`cast(count(case when ${providerSuspensions.endDate} > now() or ${providerSuspensions.endDate} is null then 1 end) as int)`,
      })
      .from(providerSuspensions)
      .where(inArray(providerSuspensions.providerId, allProviderIds))
      .groupBy(providerSuspensions.providerId);

    const disputesAgg = allProviderIds.length === 0 ? [] : await db
      .select({
        providerId: bookings.providerId,
        totalDisputes: sql<number>`cast(count(distinct ${disputes.id}) as int)`,
        unresolvedDisputes: sql<number>`cast(count(case when ${disputes.status} != 'resolved' then 1 end) as int)`,
      })
      .from(disputes)
      .innerJoin(bookings, eq(disputes.bookingId, bookings.id))
      .where(inArray(bookings.providerId, allProviderIds))
      .groupBy(bookings.providerId);

    const refundsAgg = allProviderIds.length === 0 ? [] : await db
      .select({
        providerId: bookings.providerId,
        totalRefunds: sql<number>`cast(count(distinct ${refunds.id}) as int)`,
        refundAmount: sql<number>`cast(coalesce(sum(${refunds.amount}), 0) as int)`,
      })
      .from(refunds)
      .innerJoin(bookings, eq(refunds.bookingId, bookings.id))
      .where(inArray(bookings.providerId, allProviderIds))
      .groupBy(bookings.providerId);

    const servicesAgg = allProviderIds.length === 0 ? [] : await db
      .select({
        providerId: services.providerId,
        totalServices: sql<number>`cast(count(*) as int)`,
      })
      .from(services)
      .where(inArray(services.providerId, allProviderIds))
      .groupBy(services.providerId);

    const bookingsByProviderId = new Map(bookingsAgg.map((r) => [r.providerId, r]));
    const reviewsByProviderId = new Map(reviewsAgg.map((r) => [r.providerId, r]));
    const incidentsByProviderId = new Map(incidentsAgg.map((r) => [r.providerId, r]));
    const suspensionsByProviderId = new Map(suspensionsAgg.map((r) => [r.providerId, r]));
    const disputesByProviderId = new Map(disputesAgg.map((r) => [r.providerId, r]));
    const refundsByProviderId = new Map(refundsAgg.map((r) => [r.providerId, r]));
    const servicesByProviderId = new Map(servicesAgg.map((r) => [r.providerId, r]));
    let filteredProviders = baseProviders.map((provider) => {
      const booking = bookingsByProviderId.get(provider.id);
      const review = reviewsByProviderId.get(provider.id);
      const incident = incidentsByProviderId.get(provider.id);
      const suspension = suspensionsByProviderId.get(provider.id);
      const dispute = disputesByProviderId.get(provider.id);
      const refund = refundsByProviderId.get(provider.id);
      const svc = servicesByProviderId.get(provider.id);

      const totalBookings = Number(booking?.totalBookings ?? 0);
      const completedBookings = Number(booking?.completedBookings ?? 0);
      const cancelledBookings = Number(booking?.cancelledBookings ?? 0);

      const bookings30d = Number(booking?.bookings30d ?? 0);
      const completed30d = Number(booking?.completed30d ?? 0);
      const cancelled30d = Number(booking?.cancelled30d ?? 0);

      const bookings90d = Number(booking?.bookings90d ?? 0);
      const completed90d = Number(booking?.completed90d ?? 0);
      const cancelled90d = Number(booking?.cancelled90d ?? 0);

      const totalReviews = Number(review?.totalReviews ?? 0);
      const avgRating = review?.avgRating === null || review?.avgRating === undefined ? null : Number(review.avgRating);

      const totalIncidents = Number(incident?.totalIncidents ?? 0);
      const unresolvedIncidents = Number(incident?.unresolvedIncidents ?? 0);
      const recentIncidents = Number(incident?.recentIncidents ?? 0);

      const totalSuspensions = Number(suspension?.totalSuspensions ?? 0);
      const activeSuspensions = Number(suspension?.activeSuspensions ?? 0);

      const totalDisputes = Number(dispute?.totalDisputes ?? 0);
      const unresolvedDisputes = Number(dispute?.unresolvedDisputes ?? 0);

      const totalRefunds = Number(refund?.totalRefunds ?? 0);
      const totalRefundAmount = Number(refund?.refundAmount ?? 0);

      const totalServices = Number(svc?.totalServices ?? 0);

      const completionRate = totalBookings > 0 ? (completedBookings / totalBookings) * 100 : 0;
      const cancellationRate = totalBookings > 0 ? (cancelledBookings / totalBookings) * 100 : 0;

      const completionRate30d = bookings30d > 0 ? (completed30d / bookings30d) * 100 : 0;
      const cancellationRate30d = bookings30d > 0 ? (cancelled30d / bookings30d) * 100 : 0;

      const completionRate90d = bookings90d > 0 ? (completed90d / bookings90d) * 100 : 0;
      const cancellationRate90d = bookings90d > 0 ? (cancelled90d / bookings90d) * 100 : 0;

      const daysSinceCreation = Math.floor((now.getTime() - provider.createdAt.getTime()) / (1000 * 60 * 60 * 24));
      const bookingFrequency = daysSinceCreation > 0 ? totalBookings / daysSinceCreation : 0;

      const riskAssessment = RiskScoringEngine.assessFromMetrics({
        providerId: provider.id,
        trustScore: provider.trustScore ?? 0,
        unresolvedIncidents,
        recentIncidents,
        completionRate,
        cancellationRate,
        totalSuspensions,
        avgRating: avgRating ?? 0,
        totalBookings,
        daysActive: daysSinceCreation,
      });

      const applicableRules = enabledRiskRules.filter((rule) => {
        if (rule.incidentType === "complaint" && totalIncidents > 0) return true;
        if (rule.incidentType === "violation" && unresolvedIncidents > 0) return true;
        if (rule.incidentType === "service_quality" && completionRate < 80) return true;
        if (rule.incidentType === "review_abuse" && (avgRating ?? 5) < 3.0) return true;
        return false;
      });

      return {
        id: provider.id,
        businessName: provider.businessName,
        handle: provider.handle,
        status: provider.status,
        trustLevel: provider.trustLevel,
        trustScore: provider.trustScore ?? 0,
        createdAt: provider.createdAt,
        user: {
          email: provider.userEmail,
          firstName: provider.userFirstName,
          lastName: provider.userLastName,
        },
        totalServices,

        totalBookings,
        completedBookings,
        cancelledBookings,

        bookings30d,
        completed30d,
        cancelled30d,
        bookings90d,
        completed90d,
        cancelled90d,

        totalReviews,
        avgRating,

        totalIncidents,
        unresolvedIncidents,
        recentIncidents,
        totalSuspensions,
        activeSuspensions,
        totalDisputes,
        unresolvedDisputes,
        totalRefunds,
        totalRefundAmount,

        completionRate,
        cancellationRate,
        completionRate30d,
        cancellationRate30d,
        completionRate90d,
        cancellationRate90d,

        riskScore: riskAssessment.riskScore,
        riskLevel: riskAssessment.riskLevel,
        riskFactors: riskAssessment.riskFactors,
        recommendations: riskAssessment.recommendations,
        alerts: riskAssessment.alerts,

        bookingFrequency,
        daysActive: daysSinceCreation,
        hasActiveSuspension: activeSuspensions > 0,
        hasUnresolvedIncidents: unresolvedIncidents > 0,
        hasRecentIncidents: recentIncidents > 0,
        applicableRiskRules: applicableRules,
      };
    });

    // Apply filters
    if (riskFilter !== "all") {
      filteredProviders = filteredProviders.filter(p => p.riskLevel === riskFilter);
    }

    if (statusFilter !== "all") {
      filteredProviders = filteredProviders.filter(p => p.status === statusFilter);
    }

    if (incidentsFilter === "unresolved") {
      filteredProviders = filteredProviders.filter(p => p.unresolvedIncidents > 0);
    } else if (incidentsFilter === "recent") {
      filteredProviders = filteredProviders.filter(p => p.recentIncidents > 0);
    } else if (incidentsFilter === "none") {
      filteredProviders = filteredProviders.filter(p => p.totalIncidents === 0);
    }

    filteredProviders.sort((a, b) => {
      const direction = sortOrder === "asc" ? 1 : -1;
      const toNumber = (value: unknown) => Number(value ?? 0);

      const aVal =
        sortBy === "bookings" ? toNumber(a.totalBookings) :
        sortBy === "cancellations" ? toNumber(a.cancelledBookings) :
        sortBy === "reviews" ? toNumber(a.totalReviews) :
        sortBy === "trust" ? toNumber(a.trustScore) :
        sortBy === "risk" ? toNumber(a.riskScore) :
        a.createdAt.getTime();

      const bVal =
        sortBy === "bookings" ? toNumber(b.totalBookings) :
        sortBy === "cancellations" ? toNumber(b.cancelledBookings) :
        sortBy === "reviews" ? toNumber(b.totalReviews) :
        sortBy === "trust" ? toNumber(b.trustScore) :
        sortBy === "risk" ? toNumber(b.riskScore) :
        b.createdAt.getTime();

      if (aVal === bVal) return 0;
      return aVal > bVal ? direction : -direction;
    });

    // Calculate platform-wide analytics
    const totalProviders = filteredProviders.length;
    const activeProviders = filteredProviders.filter(p => p.totalBookings > 0).length;

    const platformAverages = {
      avgCompletionRate: totalProviders > 0 ? filteredProviders.reduce((sum, p) => sum + p.completionRate, 0) / totalProviders : 0,
      avgCancellationRate: totalProviders > 0 ? filteredProviders.reduce((sum, p) => sum + p.cancellationRate, 0) / totalProviders : 0,
      avgTrustScore: totalProviders > 0 ? filteredProviders.reduce((sum, p) => sum + p.trustScore, 0) / totalProviders : 0,
      totalBookings: filteredProviders.reduce((sum, p) => sum + p.totalBookings, 0),
      totalIncidents: filteredProviders.reduce((sum, p) => sum + p.totalIncidents, 0),
      highTrustProviders: filteredProviders.filter(p => p.trustScore >= 80).length,
    };

    const providerIds = filteredProviders.map((p) => p.id);

    // Time series for the last 90 days (real data, filled for missing days)
    const bookingTrendsRaw = providerIds.length === 0 ? [] : await db
      .select({
        day: sql<Date>`date_trunc('day', ${bookings.createdAt})`,
        total: sql<number>`count(*)`,
        completed: sql<number>`count(case when ${bookings.status} = 'completed' then 1 end)`,
        canceled: sql<number>`count(case when ${bookings.status} = 'canceled' then 1 end)`,
      })
      .from(bookings)
      .where(and(
        inArray(bookings.providerId, providerIds),
        sql`${bookings.createdAt} >= ${ninetyDaysAgo}`
      ))
      .groupBy(sql`date_trunc('day', ${bookings.createdAt})`)
      .orderBy(sql`date_trunc('day', ${bookings.createdAt})`);

    const trendMap = new Map<string, { total: number; completed: number; canceled: number }>();
    bookingTrendsRaw.forEach((row) => {
      const key = new Date(row.day).toISOString().slice(0, 10);
      trendMap.set(key, {
        total: Number(row.total),
        completed: Number(row.completed),
        canceled: Number(row.canceled),
      });
    });

    const bookingTimeSeries: Array<{ date: string; total: number; completed: number; canceled: number; completionRate: number; cancellationRate: number; }>
      = [];

    for (let i = 89; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = date.toISOString().slice(0, 10);
      const value = trendMap.get(key) || { total: 0, completed: 0, canceled: 0 };
      const completionRate = value.total > 0 ? (value.completed / value.total) * 100 : 0;
      const cancellationRate = value.total > 0 ? (value.canceled / value.total) * 100 : 0;
      bookingTimeSeries.push({
        date: key,
        total: value.total,
        completed: value.completed,
        canceled: value.canceled,
        completionRate,
        cancellationRate,
      });
    }

    const recentProviders = filteredProviders.filter((p) => p.daysActive <= 90);
    const growthLast30Bookings = bookingTimeSeries.slice(-30).reduce((sum, p) => sum + p.total, 0);
    const growthPrev30Bookings = bookingTimeSeries.slice(-60, -30).reduce((sum, p) => sum + p.total, 0);
    const last30CompletionAvg = bookingTimeSeries.slice(-30).reduce((sum, p) => sum + p.completionRate, 0) / 30;
    const prev30CompletionAvg = bookingTimeSeries.slice(-60, -30).reduce((sum, p) => sum + p.completionRate, 0) / 30;
    const avgBookingGrowth = growthPrev30Bookings > 0
      ? ((growthLast30Bookings - growthPrev30Bookings) / growthPrev30Bookings) * 100
      : growthLast30Bookings > 0 ? 100 : 0;
    const avgCompletionGrowth = last30CompletionAvg - prev30CompletionAvg;

    const growthMetrics = {
      newProviders30d: recentProviders.filter((p) => p.daysActive <= 30).length,
      newProviders90d: recentProviders.length,
      avgBookingGrowth,
      avgCompletionGrowth,
    };

    // Activity patterns derived from bookings in the last 30 days
    const activityByHour = providerIds.length === 0 ? [] : await db
      .select({
        hour: sql<number>`extract(hour from ${bookings.createdAt})`,
        count: sql<number>`count(*)`,
      })
      .from(bookings)
      .where(and(
        inArray(bookings.providerId, providerIds),
        sql`${bookings.createdAt} >= ${thirtyDaysAgo}`
      ))
      .groupBy(sql`extract(hour from ${bookings.createdAt})`)
      .orderBy(sql`extract(hour from ${bookings.createdAt})`);

    const activityByWeekday = providerIds.length === 0 ? [] : await db
      .select({
        weekday: sql<number>`extract(dow from ${bookings.createdAt})`,
        count: sql<number>`count(*)`,
      })
      .from(bookings)
      .where(and(
        inArray(bookings.providerId, providerIds),
        sql`${bookings.createdAt} >= ${thirtyDaysAgo}`
      ))
      .groupBy(sql`extract(dow from ${bookings.createdAt})`)
      .orderBy(sql`extract(dow from ${bookings.createdAt})`);

    const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const busiestDays = activityByWeekday
      .sort((a, b) => Number(b.count) - Number(a.count))
      .slice(0, 2)
      .map((d) => weekdayNames[Math.max(0, Math.min(6, Number(d.weekday)))]);

    const peakHourEntries = activityByHour
      .sort((a, b) => Number(b.count) - Number(a.count))
      .slice(0, 2)
      .map((h) => `${String(Number(h.hour)).padStart(2, "0")}:00`);

    const activityPatterns = {
      peakHours: peakHourEntries.length > 0 ? peakHourEntries.join(" & ") : "N/A",
      busiestDays: busiestDays.length > 0 ? busiestDays.join(", ") : "N/A",
      avgResponseTime: 0, // Not tracked yet
    };

    return NextResponse.json({
      providers: filteredProviders,
      analytics: {
        platformAverages,
        growthMetrics,
        trends: {
          bookingTimeSeries,
        },
        activityPatterns,
        summary: {
          totalProviders,
          activeProviders,
          riskDistribution: {
            critical: filteredProviders.filter(p => p.riskLevel === 'critical').length,
            high: filteredProviders.filter(p => p.riskLevel === 'high').length,
            medium: filteredProviders.filter(p => p.riskLevel === 'medium').length,
            low: filteredProviders.filter(p => p.riskLevel === 'low').length,
          }
        }
      }
    });
  } catch (error) {
    console.error("Error fetching provider health data:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
