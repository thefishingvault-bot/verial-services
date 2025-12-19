import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { bookings, providers, reviews, trustIncidents, users } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-auth";
import { ProvidersKycQuerySchema, invalidResponse, parseQuery } from "@/lib/validation/admin";

type SortOption = "kyc_status" | "risk_score" | "created" | "business_name";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const queryResult = parseQuery(ProvidersKycQuerySchema, request);
    if (!queryResult.ok) return invalidResponse(queryResult.error);

    const sort = queryResult.data.sort as SortOption;
    const order = queryResult.data.order as "asc" | "desc";

    // Build sort clause
    let orderBy;
    switch (sort) {
      case "kyc_status":
        orderBy = order === "asc" ? asc(providers.kycStatus) : desc(providers.kycStatus);
        break;
      case "risk_score":
        // Computed after we build riskScore per provider
        orderBy = desc(providers.createdAt);
        break;
      case "created":
        orderBy = order === "asc" ? asc(providers.createdAt) : desc(providers.createdAt);
        break;
      case "business_name":
        orderBy = order === "asc" ? asc(providers.businessName) : desc(providers.businessName);
        break;
      default:
        orderBy = desc(providers.createdAt);
    }

    // Fetch all providers with their user data
    const allProviders = await db
      .select({
        id: providers.id,
        businessName: providers.businessName,
        handle: providers.handle,
        status: providers.status,
        kycStatus: providers.kycStatus,
        kycSubmittedAt: providers.kycSubmittedAt,
        kycVerifiedAt: providers.kycVerifiedAt,
        identityDocumentUrl: providers.identityDocumentUrl,
        businessDocumentUrl: providers.businessDocumentUrl,
        stripeConnectId: providers.stripeConnectId,
        chargesEnabled: providers.chargesEnabled,
        payoutsEnabled: providers.payoutsEnabled,
        trustScore: providers.trustScore,
        createdAt: providers.createdAt,
        user: {
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        },
      })
      .from(providers)
      .leftJoin(users, eq(providers.userId, users.id))
      .orderBy(orderBy);

    const providerIds = allProviders.map((p) => p.id);

    const toWeekKey = (date: Date) => {
      const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      const day = d.getUTCDay();
      const offset = (day + 6) % 7; // Monday as week start
      d.setUTCDate(d.getUTCDate() - offset);
      return d.toISOString().slice(0, 10);
    };

    const weeksBack = 5; // current week + 5 previous weeks = 6 points
    const now = new Date();
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - weeksBack * 7);
    const seriesStartWeekKey = toWeekKey(start);
    const seriesStartDate = new Date(seriesStartWeekKey + "T00:00:00.000Z");

    const [bookingAggRows, reviewAggRows, incidentAggRows, submissionSeriesRows, verificationSeriesRows, rejectionSeriesRows] = await Promise.all([
      providerIds.length
        ? db
            .select({
              providerId: bookings.providerId,
              totalBookings: sql<number>`COUNT(*)`,
              completedBookings: sql<number>`COUNT(*) FILTER (WHERE ${bookings.status} = 'completed')`,
              canceledBookings: sql<number>`COUNT(*) FILTER (WHERE ${bookings.status} IN ('canceled_customer', 'canceled_provider'))`,
            })
            .from(bookings)
            .where(inArray(bookings.providerId, providerIds))
            .groupBy(bookings.providerId)
        : Promise.resolve([]),
      providerIds.length
        ? db
            .select({
              providerId: reviews.providerId,
              totalReviews: sql<number>`COUNT(*) FILTER (WHERE ${reviews.isHidden} = false)`,
              avgRating: sql<number>`COALESCE(AVG(${reviews.rating}) FILTER (WHERE ${reviews.isHidden} = false), 0)`,
            })
            .from(reviews)
            .where(inArray(reviews.providerId, providerIds))
            .groupBy(reviews.providerId)
        : Promise.resolve([]),
      providerIds.length
        ? db
            .select({
              providerId: trustIncidents.providerId,
              totalIncidents: sql<number>`COUNT(*)`,
              unresolvedIncidents: sql<number>`COUNT(*) FILTER (WHERE ${trustIncidents.resolved} = false)`,
            })
            .from(trustIncidents)
            .where(inArray(trustIncidents.providerId, providerIds))
            .groupBy(trustIncidents.providerId)
        : Promise.resolve([]),
      db
        .select({
          weekStart: sql<string>`TO_CHAR(DATE_TRUNC('week', ${providers.kycSubmittedAt}), 'YYYY-MM-DD')`,
          count: sql<number>`COUNT(*)`,
        })
        .from(providers)
        .where(and(isNotNull(providers.kycSubmittedAt), gte(providers.kycSubmittedAt, seriesStartDate)))
        .groupBy(sql`DATE_TRUNC('week', ${providers.kycSubmittedAt})`)
        .orderBy(asc(sql`DATE_TRUNC('week', ${providers.kycSubmittedAt})`)),
      db
        .select({
          weekStart: sql<string>`TO_CHAR(DATE_TRUNC('week', ${providers.kycVerifiedAt}), 'YYYY-MM-DD')`,
          count: sql<number>`COUNT(*)`,
        })
        .from(providers)
        .where(and(isNotNull(providers.kycVerifiedAt), gte(providers.kycVerifiedAt, seriesStartDate)))
        .groupBy(sql`DATE_TRUNC('week', ${providers.kycVerifiedAt})`)
        .orderBy(asc(sql`DATE_TRUNC('week', ${providers.kycVerifiedAt})`)),
      db
        .select({
          weekStart: sql<string>`TO_CHAR(DATE_TRUNC('week', ${providers.kycSubmittedAt}), 'YYYY-MM-DD')`,
          count: sql<number>`COUNT(*)`,
        })
        .from(providers)
        .where(
          and(
            eq(providers.kycStatus, "rejected"),
            isNotNull(providers.kycSubmittedAt),
            gte(providers.kycSubmittedAt, seriesStartDate),
          ),
        )
        .groupBy(sql`DATE_TRUNC('week', ${providers.kycSubmittedAt})`)
        .orderBy(asc(sql`DATE_TRUNC('week', ${providers.kycSubmittedAt})`)),
    ]);

    const bookingAgg = new Map(
      bookingAggRows.map((r) => [
        r.providerId,
        {
          totalBookings: Number(r.totalBookings ?? 0),
          completedBookings: Number(r.completedBookings ?? 0),
          canceledBookings: Number(r.canceledBookings ?? 0),
        },
      ]),
    );

    const reviewAgg = new Map(
      reviewAggRows.map((r) => [
        r.providerId,
        {
          totalReviews: Number(r.totalReviews ?? 0),
          avgRating: Number(r.avgRating ?? 0),
        },
      ]),
    );

    const incidentAgg = new Map(
      incidentAggRows.map((r) => [
        r.providerId,
        {
          totalIncidents: Number(r.totalIncidents ?? 0),
          unresolvedIncidents: Number(r.unresolvedIncidents ?? 0),
        },
      ]),
    );

    // Calculate additional metrics for each provider
    const providersWithMetrics = allProviders.map((provider) => {
        const bookingRow = bookingAgg.get(provider.id) ?? {
          totalBookings: 0,
          completedBookings: 0,
          canceledBookings: 0,
        };

        const totalBookings = bookingRow.totalBookings;
        const completedBookings = bookingRow.completedBookings;
        const canceledBookings = bookingRow.canceledBookings;

        const completionRate = totalBookings > 0 ? (completedBookings / totalBookings) * 100 : 0;
        const cancellationRate = totalBookings > 0 ? (canceledBookings / totalBookings) * 100 : 0;

        const reviewRow = reviewAgg.get(provider.id) ?? { totalReviews: 0, avgRating: 0 };
        const totalReviews = reviewRow.totalReviews;
        const avgRating = reviewRow.avgRating;

        // Calculate KYC completion percentage
        let kycCompletionPercentage = 0;
        const missingDocuments: string[] = [];
        const kycRiskFactors: string[] = [];
        const kycRecommendations: string[] = [];
        const kycAlerts: string[] = [];
        const complianceFlags: string[] = [];

        // Document verification status (best-effort, based on available fields)
        const identityStatus = provider.identityDocumentUrl
          ? provider.kycStatus === "verified"
            ? ("verified" as const)
            : provider.kycStatus === "rejected"
              ? ("rejected" as const)
              : ("pending" as const)
          : ("missing" as const);

        const businessStatus = provider.businessDocumentUrl
          ? provider.kycStatus === "verified"
            ? ("verified" as const)
            : provider.kycStatus === "rejected"
              ? ("rejected" as const)
              : ("pending" as const)
          : ("missing" as const);

        const bankStatus = provider.stripeConnectId
          ? provider.chargesEnabled && provider.payoutsEnabled
            ? ("verified" as const)
            : ("pending" as const)
          : ("missing" as const);

        const documentVerificationStatus = {
          identity: identityStatus,
          business: businessStatus,
          bank: bankStatus,
        };

        // Calculate completion based on available data
        const totalSteps = 4; // KYC submission, identity doc, business doc, stripe connect
        let completedSteps = 0;

        if (provider.kycStatus !== "not_started") completedSteps++;
        if (provider.identityDocumentUrl) completedSteps++;
        if (provider.businessDocumentUrl) completedSteps++;
        if (provider.stripeConnectId) completedSteps++;

        kycCompletionPercentage = Math.round((completedSteps / totalSteps) * 100);

        // Determine missing documents
        if (identityStatus === "missing") missingDocuments.push("Identity Document");
        if (businessStatus === "missing") missingDocuments.push("Business Document");
        if (bankStatus === "missing") missingDocuments.push("Bank Account Verification");

        // Calculate KYC age (days since submitted)
        const kycAge = provider.kycSubmittedAt
          ? Math.floor((Date.now() - provider.kycSubmittedAt.getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        // Risk assessment logic
        let calculatedRiskLevel: "low" | "medium" | "high" | "critical" = "low";
        let calculatedRiskScore = 0;

        // Risk factors based on various metrics
        if (provider.kycStatus === "rejected") {
          calculatedRiskScore += 50;
          kycRiskFactors.push("Previous KYC rejection");
          kycAlerts.push("Provider has been rejected in KYC process");
        }

        if (provider.kycStatus === "pending_review" && kycAge > 30) {
          calculatedRiskScore += 20;
          kycRiskFactors.push("Long pending KYC review");
          kycAlerts.push("KYC review overdue - requires immediate attention");
        }

        if (missingDocuments.length > 0) {
          calculatedRiskScore += missingDocuments.length * 10;
          kycRiskFactors.push(`${missingDocuments.length} missing documents`);
        }

        if (completionRate < 70) {
          calculatedRiskScore += 15;
          kycRiskFactors.push("Low booking completion rate");
        }

        if (cancellationRate > 20 && totalBookings >= 5) {
          calculatedRiskScore += 10;
          kycRiskFactors.push("High cancellation rate");
        }

        if (totalBookings < 5) {
          calculatedRiskScore += 10;
          kycRiskFactors.push("Limited booking history");
        }

        // Adjust risk based on trust score (lower trust score increases risk)
        if (provider.trustScore < 50) {
          calculatedRiskScore += 20;
          kycRiskFactors.push("Low trust score");
        } else if (provider.trustScore < 75) {
          calculatedRiskScore += 10;
          kycRiskFactors.push("Moderate trust score");
        }

        // Determine risk level
        if (calculatedRiskScore >= 70) calculatedRiskLevel = "critical";
        else if (calculatedRiskScore >= 40) calculatedRiskLevel = "high";
        else if (calculatedRiskScore >= 20) calculatedRiskLevel = "medium";
        else calculatedRiskLevel = "low";

        // Generate recommendations
        if (missingDocuments.length > 0) {
          kycRecommendations.push(`Request missing documents: ${missingDocuments.join(", ")}`);
        }

        if (provider.kycStatus === "pending_review") {
          kycRecommendations.push("Complete KYC review process");
        }

        if (completionRate < 80) {
          kycRecommendations.push("Improve booking completion rate through better service quality");
        }

        if (!provider.stripeConnectId) {
          kycRecommendations.push("Complete Stripe Connect onboarding for payment processing");
        }

        // Compliance flags
        if (provider.kycStatus === "rejected") {
          complianceFlags.push("KYC Rejection");
        }

        if (missingDocuments.length > 0) {
          complianceFlags.push("Incomplete Documentation");
        }

        if (calculatedRiskLevel === "critical" || calculatedRiskLevel === "high") {
          complianceFlags.push("High Risk Provider");
        }

        // Calculate days active
        const daysActive = Math.floor((Date.now() - provider.createdAt.getTime()) / (1000 * 60 * 60 * 24));

        const incidentRow = incidentAgg.get(provider.id) ?? { totalIncidents: 0, unresolvedIncidents: 0 };
        const unresolvedIncidents = incidentRow.unresolvedIncidents;
        const totalIncidents = incidentRow.totalIncidents;

        if (unresolvedIncidents > 0) {
          calculatedRiskScore += Math.min(20, unresolvedIncidents * 5);
          kycRiskFactors.push("Unresolved trust incidents");
        }

        // Stripe onboarding status
        let stripeOnboardingStatus: "not_started" | "in_progress" | "completed" | "failed" = "not_started";
        if (provider.stripeConnectId) {
          stripeOnboardingStatus = provider.chargesEnabled && provider.payoutsEnabled ? "completed" : "in_progress";
        }

        return {
          ...provider,
          totalBookings,
          completionRate,
          cancellationRate,
          totalReviews,
          avgRating,
          kycCompletionPercentage,
          missingDocuments,
          kycAge,
          kycRiskFactors,
          kycRecommendations,
          kycAlerts,
          documentVerificationStatus,
          stripeOnboardingStatus,
          complianceFlags,
          daysActive,
          totalIncidents,
          unresolvedIncidents,
          riskLevel: calculatedRiskLevel,
          riskScore: calculatedRiskScore,
        };
      });

    if (sort === "risk_score") {
      providersWithMetrics.sort((a, b) => {
        const diff = (a.riskScore ?? 0) - (b.riskScore ?? 0);
        return order === "asc" ? diff : -diff;
      });
    }

    // Calculate platform-wide analytics
    const totalProviders = providersWithMetrics.length;
    const verifiedProviders = providersWithMetrics.filter(p => p.kycStatus === "verified").length;
    const pendingReview = providersWithMetrics.filter(p => p.kycStatus === "pending_review").length;
    const rejectedProviders = providersWithMetrics.filter(p => p.kycStatus === "rejected").length;
    const notStarted = providersWithMetrics.filter(p => p.kycStatus === "not_started").length;
    const inProgress = providersWithMetrics.filter(p => p.kycStatus === "in_progress").length;

    // Risk distribution
    const riskDistribution = {
      critical: providersWithMetrics.filter(p => p.riskLevel === "critical").length,
      high: providersWithMetrics.filter(p => p.riskLevel === "high").length,
      medium: providersWithMetrics.filter(p => p.riskLevel === "medium").length,
      low: providersWithMetrics.filter(p => p.riskLevel === "low").length,
    };

    // Document status
    const documentStatus = {
      identityVerified: providersWithMetrics.filter(p => p.documentVerificationStatus.identity === "verified").length,
      businessVerified: providersWithMetrics.filter(p => p.documentVerificationStatus.business === "verified").length,
      bankVerified: providersWithMetrics.filter(p => p.documentVerificationStatus.bank === "verified").length,
      documentsMissing: providersWithMetrics.filter(p =>
        p.documentVerificationStatus.identity === "missing" ||
        p.documentVerificationStatus.business === "missing" ||
        p.documentVerificationStatus.bank === "missing"
      ).length,
    };

    // Timeline metrics (30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentSubmissions = providersWithMetrics.filter(p =>
      p.kycSubmittedAt && p.kycSubmittedAt >= thirtyDaysAgo
    ).length;

    const recentVerifications = providersWithMetrics.filter(p =>
      p.kycVerifiedAt && p.kycVerifiedAt >= thirtyDaysAgo
    ).length;

    const recentRejections = providersWithMetrics.filter((p) =>
      p.kycStatus === "rejected" && p.kycSubmittedAt && p.kycSubmittedAt >= thirtyDaysAgo,
    ).length;

    // Calculate average processing time
    const completedKycs = providersWithMetrics.filter(p =>
      p.kycSubmittedAt && p.kycVerifiedAt
    );

    const avgProcessingTime = completedKycs.length > 0
      ? completedKycs.reduce((sum, p) => {
          const processingTime = p.kycVerifiedAt!.getTime() - p.kycSubmittedAt!.getTime();
          return sum + (processingTime / (1000 * 60 * 60 * 24)); // Convert to days
        }, 0) / completedKycs.length
      : 0;

    const kycCompletionRate = totalProviders > 0 ? (verifiedProviders / totalProviders) * 100 : 0;

    const analytics = {
      platformKycStats: {
        totalProviders,
        verifiedProviders,
        pendingReview,
        rejectedProviders,
        notStarted,
        inProgress,
        avgKycCompletionTime: Math.round(avgProcessingTime * 10) / 10,
        kycCompletionRate: Math.round(kycCompletionRate * 10) / 10,
      },
      riskDistribution,
      documentStatus,
      timelineSeries: (() => {
        const mk = (rows: Array<{ weekStart: string; count: number }>) =>
          new Map(rows.map((r) => [String(r.weekStart), Number(r.count ?? 0)]));

        const submissionsByWeek = mk(submissionSeriesRows);
        const verificationsByWeek = mk(verificationSeriesRows);
        const rejectionsByWeek = mk(rejectionSeriesRows);

        const points: Array<{ name: string; submissions: number; verifications: number; rejections: number }> = [];
        const startWeek = new Date(seriesStartDate);
        for (let i = 0; i <= weeksBack; i++) {
          const d = new Date(startWeek);
          d.setUTCDate(d.getUTCDate() + i * 7);
          const key = d.toISOString().slice(0, 10);
          points.push({
            name: key,
            submissions: submissionsByWeek.get(key) ?? 0,
            verifications: verificationsByWeek.get(key) ?? 0,
            rejections: rejectionsByWeek.get(key) ?? 0,
          });
        }

        return { points };
      })(),
      timelineMetrics: {
        kycSubmissions30d: recentSubmissions,
        kycVerifications30d: recentVerifications,
        kycRejections30d: recentRejections,
        avgProcessingTime: Math.round(avgProcessingTime * 10) / 10,
      },
    };

    return NextResponse.json({
      providers: providersWithMetrics,
      analytics,
    });

  } catch (error) {
    console.error("Error fetching KYC providers:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}