import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { eq, and, gte, lte, desc, asc, sql } from "drizzle-orm";
import { providers, users, bookings, reviews } from "@/db/schema";

type SortOption = "kyc_status" | "risk_score" | "created" | "business_name";

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user[0] || user[0].role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const sort = (searchParams.get("sort") as SortOption) || "kyc_status";
    const order = searchParams.get("order") === "asc" ? "asc" : "desc";

    // Build sort clause
    let orderBy;
    switch (sort) {
      case "kyc_status":
        orderBy = order === "asc" ? asc(providers.kycStatus) : desc(providers.kycStatus);
        break;
      case "risk_score":
        orderBy = order === "asc" ? asc(providers.trustScore) : desc(providers.trustScore);
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

    // Calculate additional metrics for each provider
    const providersWithMetrics = await Promise.all(
      allProviders.map(async (provider) => {
        // Get booking metrics
        const providerBookings = await db
          .select({
            id: bookings.id,
            status: bookings.status,
            createdAt: bookings.createdAt,
          })
          .from(bookings)
          .where(eq(bookings.providerId, provider.id));

        const totalBookings = providerBookings.length;
        const completedBookings = providerBookings.filter(b => b.status === "completed").length;
        const completionRate = totalBookings > 0 ? (completedBookings / totalBookings) * 100 : 0;

        // Get review metrics
        const providerReviews = await db
          .select({
            rating: reviews.rating,
          })
          .from(reviews)
          .where(eq(reviews.providerId, provider.id));

        const avgRating = providerReviews.length > 0
          ? providerReviews.reduce((sum, r) => sum + r.rating, 0) / providerReviews.length
          : 0;

        // Calculate KYC completion percentage
        let kycCompletionPercentage = 0;
        const missingDocuments: string[] = [];
        const kycRiskFactors: string[] = [];
        const kycRecommendations: string[] = [];
        const kycAlerts: string[] = [];
        const complianceFlags: string[] = [];

        // Document verification status
        const documentVerificationStatus = {
          identity: provider.identityDocumentUrl ? "verified" : "missing" as const,
          business: provider.businessDocumentUrl ? "verified" : "missing" as const,
          bank: provider.stripeConnectId ? "verified" : "missing" as const,
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
        if (!provider.identityDocumentUrl) missingDocuments.push("Identity Document");
        if (!provider.businessDocumentUrl) missingDocuments.push("Business Document");
        if (!provider.stripeConnectId) missingDocuments.push("Bank Account Verification");

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

        // Get unresolved incidents (simplified - in real app this would be from incidents table)
        const unresolvedIncidents = 0; // Placeholder
        const totalIncidents = 0; // Placeholder

        // Stripe onboarding status
        let stripeOnboardingStatus: "not_started" | "in_progress" | "completed" | "failed" = "not_started";
        if (provider.stripeConnectId) {
          stripeOnboardingStatus = provider.chargesEnabled && provider.payoutsEnabled ? "completed" : "in_progress";
        }

        return {
          ...provider,
          totalBookings,
          completionRate,
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
      })
    );

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

    const recentRejections = providersWithMetrics.filter(p =>
      p.kycStatus === "rejected" && p.createdAt >= thirtyDaysAgo
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