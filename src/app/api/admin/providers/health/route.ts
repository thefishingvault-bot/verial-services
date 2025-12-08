import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers, users, bookings, reviews, trustIncidents, providerSuspensions, disputes, refunds, riskRules } from "@/db/schema";
import { eq, desc, asc, sql, inArray, and } from "drizzle-orm";
import { RiskScoringEngine } from "@/lib/risk-scoring";
import { requireAdmin } from "@/lib/admin-auth";

type SortOption = "bookings" | "cancellations" | "reviews" | "trust" | "risk" | "created";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const { searchParams } = new URL(request.url);
    const sortBy = (searchParams.get("sort") as SortOption) || "risk";
    const sortOrder = searchParams.get("order") === "asc" ? asc : desc;
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

    // Fetch providers with comprehensive health metrics
    const providersWithHealth = await db
      .select({
        id: providers.id,
        businessName: providers.businessName,
        handle: providers.handle,
        status: providers.status,
        trustLevel: providers.trustLevel,
        trustScore: providers.trustScore,
        createdAt: providers.createdAt,
        user: {
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        },
        // Core booking metrics
        totalBookings: sql<number>`count(${bookings.id})`.as("total_bookings"),
        completedBookings: sql<number>`count(case when ${bookings.status} = 'completed' then 1 end)`.as("completed_bookings"),
        cancelledBookings: sql<number>`count(case when ${bookings.status} = 'canceled' then 1 end)`.as("cancelled_bookings"),

        // 30-day performance trends
        bookings30d: sql<number>`count(case when ${bookings.createdAt} >= ${thirtyDaysAgo} then 1 end)`.as("bookings_30d"),
        completed30d: sql<number>`count(case when ${bookings.status} = 'completed' and ${bookings.createdAt} >= ${thirtyDaysAgo} then 1 end)`.as("completed_30d"),
        cancelled30d: sql<number>`count(case when ${bookings.status} = 'canceled' and ${bookings.createdAt} >= ${thirtyDaysAgo} then 1 end)`.as("cancelled_30d"),

        // 90-day performance trends
        bookings90d: sql<number>`count(case when ${bookings.createdAt} >= ${ninetyDaysAgo} then 1 end)`.as("bookings_90d"),
        completed90d: sql<number>`count(case when ${bookings.status} = 'completed' and ${bookings.createdAt} >= ${ninetyDaysAgo} then 1 end)`.as("completed_90d"),
        cancelled90d: sql<number>`count(case when ${bookings.status} = 'canceled' and ${bookings.createdAt} >= ${ninetyDaysAgo} then 1 end)`.as("cancelled_90d"),

        // Review metrics
        totalReviews: sql<number>`count(${reviews.id})`.as("total_reviews"),
        avgRating: sql<number>`avg(${reviews.rating})`.as("avg_rating"),

        // Trust incidents
        totalIncidents: sql<number>`count(distinct ${trustIncidents.id})`.as("total_incidents"),
        unresolvedIncidents: sql<number>`count(case when ${trustIncidents.resolved} = false then 1 end)`.as("unresolved_incidents"),
        recentIncidents: sql<number>`count(case when ${trustIncidents.createdAt} >= ${thirtyDaysAgo} then 1 end)`.as("recent_incidents"),

        // Suspensions
        totalSuspensions: sql<number>`count(distinct ${providerSuspensions.id})`.as("total_suspensions"),
        activeSuspensions: sql<number>`count(case when ${providerSuspensions.endDate} > now() or ${providerSuspensions.endDate} is null then 1 end)`.as("active_suspensions"),

        // Disputes and refunds
        totalDisputes: sql<number>`count(distinct ${disputes.id})`.as("total_disputes"),
        unresolvedDisputes: sql<number>`count(case when ${disputes.status} != 'resolved' then 1 end)`.as("unresolved_disputes"),
        totalRefunds: sql<number>`count(distinct ${refunds.id})`.as("total_refunds"),
        refundAmount: sql<number>`coalesce(sum(${refunds.amount}), 0)`.as("total_refund_amount"),
      })
      .from(providers)
      .leftJoin(users, eq(providers.userId, users.id))
      .leftJoin(bookings, eq(providers.id, bookings.providerId))
      .leftJoin(reviews, eq(providers.id, reviews.providerId))
      .leftJoin(trustIncidents, eq(providers.id, trustIncidents.providerId))
      .leftJoin(providerSuspensions, eq(providers.id, providerSuspensions.providerId))
      .leftJoin(disputes, eq(bookings.id, disputes.bookingId))
      .leftJoin(refunds, eq(bookings.id, refunds.bookingId))
      .groupBy(providers.id, users.email, users.firstName, users.lastName)
      .orderBy(
        sortBy === "bookings" ? sortOrder(sql`count(${bookings.id})`) :
        sortBy === "cancellations" ? sortOrder(sql`count(case when ${bookings.status} = 'canceled' then 1 end)`) :
        sortBy === "reviews" ? sortOrder(sql`count(${reviews.id})`) :
        sortBy === "trust" ? sortOrder(providers.trustScore) :
        sortBy === "risk" ? sortOrder(sql`count(case when ${trustIncidents.resolved} = false then 1 end)`) :
        sortOrder(providers.createdAt)
      );

    // Process and enhance the data
    let filteredProviders = await Promise.all(
      providersWithHealth.map(async (provider) => {
        const completionRate = provider.totalBookings > 0 ? (provider.completedBookings / provider.totalBookings) * 100 : 0;
        const cancellationRate = provider.totalBookings > 0 ? (provider.cancelledBookings / provider.totalBookings) * 100 : 0;

        const completionRate30d = provider.bookings30d > 0 ? (provider.completed30d / provider.bookings30d) * 100 : 0;
        const cancellationRate30d = provider.bookings30d > 0 ? (provider.cancelled30d / provider.bookings30d) * 100 : 0;

        const completionRate90d = provider.bookings90d > 0 ? (provider.completed90d / provider.bookings90d) * 100 : 0;
        const cancellationRate90d = provider.bookings90d > 0 ? (provider.cancelled90d / provider.bookings90d) * 100 : 0;

        // Calculate comprehensive risk assessment
        const riskAssessment = await RiskScoringEngine.calculateRiskScore(provider.id);

        // Activity patterns (booking frequency)
        const daysSinceCreation = Math.floor((now.getTime() - provider.createdAt.getTime()) / (1000 * 60 * 60 * 24));
        const bookingFrequency = daysSinceCreation > 0 ? provider.totalBookings / daysSinceCreation : 0;

        // Determine applicable risk rules
        const applicableRules = enabledRiskRules.filter(rule => {
          // Check if this rule applies based on incident types and provider data
          if (rule.incidentType === "complaint" && provider.totalIncidents > 0) return true;
          if (rule.incidentType === "violation" && provider.unresolvedIncidents > 0) return true;
          if (rule.incidentType === "service_quality" && completionRate < 80) return true;
          if (rule.incidentType === "review_abuse" && provider.avgRating < 3.0) return true;
          return false;
        });

        return {
          ...provider,
          // Core rates
          completionRate,
          cancellationRate,
          // Trend rates
          completionRate30d,
          cancellationRate30d,
          completionRate90d,
          cancellationRate90d,
          // Risk assessment
          riskScore: riskAssessment.riskScore,
          riskLevel: riskAssessment.riskLevel,
          riskFactors: riskAssessment.riskFactors,
          recommendations: riskAssessment.recommendations,
          alerts: riskAssessment.alerts,
          // Activity patterns
          bookingFrequency,
          daysActive: daysSinceCreation,
          // Status indicators
          hasActiveSuspension: provider.activeSuspensions > 0,
          hasUnresolvedIncidents: provider.unresolvedIncidents > 0,
          hasRecentIncidents: provider.recentIncidents > 0,
          // Risk rules
          applicableRiskRules: applicableRules,
        };
      })
    );

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

    // Calculate growth metrics (comparing 30d vs 90d periods)
    const recentProviders = filteredProviders.filter(p => p.daysActive <= 90);
    const establishedProviders = filteredProviders.filter(p => p.daysActive > 90);

    const growthMetrics = {
      newProviders30d: recentProviders.filter(p => p.daysActive <= 30).length,
      newProviders90d: recentProviders.length,
      avgBookingGrowth: establishedProviders.length > 0 ?
        establishedProviders.reduce((sum, p) => sum + (p.bookings30d - p.bookings90d + p.bookings30d), 0) / establishedProviders.length : 0,
      avgCompletionGrowth: establishedProviders.length > 0 ?
        establishedProviders.reduce((sum, p) => sum + (p.completionRate30d - p.completionRate90d), 0) / establishedProviders.length : 0,
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
