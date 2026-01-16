import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import { bookings, providers, reviews, trustIncidents, users } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-auth";
import { ProvidersKycQuerySchema, invalidResponse, parseQuery } from "@/lib/validation/admin";

type SortOption = "kyc_status" | "risk_score" | "created" | "business_name";

type KycRiskLevel = "low" | "medium" | "high" | "critical";
type KycDocStatusKey =
  | "identity_missing"
  | "business_missing"
  | "bank_missing"
  | "any_missing"
  | "any_pending"
  | "all_verified";

const parseOptionalDate = (value: string | undefined) => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

type SearchColumn =
  | typeof providers.id
  | typeof providers.businessName
  | typeof providers.handle
  | typeof users.email
  | typeof users.firstName
  | typeof users.lastName;

const lowerLike = (col: SearchColumn, needle: string) => {
  // Postgres: lower(col) LIKE %lower(needle)%
  const pattern = `%${needle.toLowerCase()}%`;
  return sql<boolean>`LOWER(${col}) LIKE ${pattern}`;
};

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const queryResult = parseQuery(ProvidersKycQuerySchema, request);
    if (!queryResult.ok) return invalidResponse(queryResult.error);

    const {
      page,
      pageSize,
      search,
      kycStatus,
      riskLevel,
      docStatus,
      submittedFrom,
      submittedTo,
      kycAgeMin,
      kycAgeMax,
      sort,
      order,
    } = queryResult.data as {
      page: number;
      pageSize: number;
      search?: string;
      kycStatus?: string[];
      riskLevel?: KycRiskLevel[];
      docStatus?: KycDocStatusKey[];
      submittedFrom?: string;
      submittedTo?: string;
      kycAgeMin?: number;
      kycAgeMax?: number;
      sort: SortOption;
      order: "asc" | "desc";
    };

    const parsedFrom = parseOptionalDate(submittedFrom);
    if (parsedFrom === null) return invalidResponse({ formErrors: ["Invalid submittedFrom"], fieldErrors: {} });
    const parsedTo = parseOptionalDate(submittedTo);
    if (parsedTo === null) return invalidResponse({ formErrors: ["Invalid submittedTo"], fieldErrors: {} });

    const offset = (page - 1) * pageSize;

    const bookingAgg = db
      .select({
        providerId: bookings.providerId,
        totalBookings: sql<number>`COUNT(*)`.as("totalBookings"),
        completedBookings: sql<number>`COUNT(*) FILTER (WHERE ${bookings.status} = 'completed')`.as("completedBookings"),
        canceledBookings: sql<number>`COUNT(*) FILTER (WHERE ${bookings.status} IN ('canceled_customer', 'canceled_provider'))`.as(
          "canceledBookings",
        ),
      })
      .from(bookings)
      .groupBy(bookings.providerId)
      .as("booking_agg");

    const reviewAgg = db
      .select({
        providerId: reviews.providerId,
        totalReviews: sql<number>`COUNT(*) FILTER (WHERE ${reviews.isHidden} = false)`.as("totalReviews"),
        avgRating: sql<number>`COALESCE(AVG(${reviews.rating}) FILTER (WHERE ${reviews.isHidden} = false), 0)`.as(
          "avgRating",
        ),
      })
      .from(reviews)
      .groupBy(reviews.providerId)
      .as("review_agg");

    const incidentAgg = db
      .select({
        providerId: trustIncidents.providerId,
        totalIncidents: sql<number>`COUNT(*)`.as("totalIncidents"),
        unresolvedIncidents: sql<number>`COUNT(*) FILTER (WHERE ${trustIncidents.resolved} = false)`.as(
          "unresolvedIncidents",
        ),
      })
      .from(trustIncidents)
      .groupBy(trustIncidents.providerId)
      .as("incident_agg");

    const totalBookingsExpr = sql<number>`COALESCE(${bookingAgg.totalBookings}, 0)`;
    const completedBookingsExpr = sql<number>`COALESCE(${bookingAgg.completedBookings}, 0)`;
    const canceledBookingsExpr = sql<number>`COALESCE(${bookingAgg.canceledBookings}, 0)`;
    const unresolvedIncidentsExpr = sql<number>`COALESCE(${incidentAgg.unresolvedIncidents}, 0)`;

    const completionRateExpr = sql<number>`CASE WHEN ${totalBookingsExpr} > 0 THEN (${completedBookingsExpr}::float / ${totalBookingsExpr}::float) * 100 ELSE 0 END`;
    const cancellationRateExpr = sql<number>`CASE WHEN ${totalBookingsExpr} > 0 THEN (${canceledBookingsExpr}::float / ${totalBookingsExpr}::float) * 100 ELSE 0 END`;

    const kycAgeExpr = sql<number>`CASE WHEN ${providers.kycSubmittedAt} IS NOT NULL THEN FLOOR(EXTRACT(EPOCH FROM (NOW() - ${providers.kycSubmittedAt})) / 86400) ELSE 0 END`;

    const identityStatusExpr = sql<"pending" | "verified" | "rejected" | "missing">`
      CASE
        WHEN ${providers.identityDocumentUrl} IS NULL THEN 'missing'
        WHEN ${providers.kycStatus} = 'verified' THEN 'verified'
        WHEN ${providers.kycStatus} = 'rejected' THEN 'rejected'
        ELSE 'pending'
      END
    `;
    const businessStatusExpr = sql<"pending" | "verified" | "rejected" | "missing">`
      CASE
        WHEN ${providers.businessDocumentUrl} IS NULL THEN 'missing'
        WHEN ${providers.kycStatus} = 'verified' THEN 'verified'
        WHEN ${providers.kycStatus} = 'rejected' THEN 'rejected'
        ELSE 'pending'
      END
    `;
    const bankStatusExpr = sql<"pending" | "verified" | "rejected" | "missing">`
      CASE
        WHEN ${providers.stripeConnectId} IS NULL THEN 'missing'
        WHEN ${providers.chargesEnabled} = true AND ${providers.payoutsEnabled} = true THEN 'verified'
        ELSE 'pending'
      END
    `;

    const missingDocsCountExpr = sql<number>`
      (CASE WHEN ${identityStatusExpr} = 'missing' THEN 1 ELSE 0 END)
      + (CASE WHEN ${businessStatusExpr} = 'missing' THEN 1 ELSE 0 END)
      + (CASE WHEN ${bankStatusExpr} = 'missing' THEN 1 ELSE 0 END)
    `;

    const riskScoreExpr = sql<number>`
      (
        0
        + (CASE WHEN ${providers.kycStatus} = 'rejected' THEN 50 ELSE 0 END)
        + (CASE WHEN ${providers.kycStatus} = 'pending_review' AND ${kycAgeExpr} > 30 THEN 20 ELSE 0 END)
        + (${missingDocsCountExpr} * 10)
        + (CASE WHEN ${completionRateExpr} < 70 THEN 15 ELSE 0 END)
        + (CASE WHEN ${cancellationRateExpr} > 20 AND ${totalBookingsExpr} >= 5 THEN 10 ELSE 0 END)
        + (CASE WHEN ${totalBookingsExpr} < 5 THEN 10 ELSE 0 END)
        + (CASE WHEN ${providers.trustScore} < 50 THEN 20 WHEN ${providers.trustScore} < 75 THEN 10 ELSE 0 END)
        + LEAST(20, ${unresolvedIncidentsExpr} * 5)
      )
    `;

    const riskLevelExpr = sql<KycRiskLevel>`
      CASE
        WHEN ${riskScoreExpr} >= 70 THEN 'critical'
        WHEN ${riskScoreExpr} >= 40 THEN 'high'
        WHEN ${riskScoreExpr} >= 20 THEN 'medium'
        ELSE 'low'
      END
    `;

    const whereParts: Array<ReturnType<typeof and>> = [];
    const conditions: Array<Parameters<typeof and>[number]> = [];

    if (search) {
      const needle = search.toLowerCase();
      conditions.push(
        or(
          lowerLike(providers.id, needle),
          lowerLike(providers.businessName, needle),
          lowerLike(providers.handle, needle),
          lowerLike(users.email, needle),
          lowerLike(users.firstName, needle),
          lowerLike(users.lastName, needle),
        ),
      );
    }

    if (kycStatus?.length) {
      // Cast enum-like column to text for flexible filtering via query params.
      conditions.push(inArray(sql<string>`(${providers.kycStatus})::text`, kycStatus));
    }

    if (parsedFrom) {
      conditions.push(and(isNotNull(providers.kycSubmittedAt), gte(providers.kycSubmittedAt, parsedFrom)));
    }

    if (parsedTo) {
      conditions.push(and(isNotNull(providers.kycSubmittedAt), lte(providers.kycSubmittedAt, parsedTo)));
    }

    if (typeof kycAgeMin === "number") {
      conditions.push(sql<boolean>`${kycAgeExpr} >= ${kycAgeMin}`);
    }

    if (typeof kycAgeMax === "number") {
      conditions.push(sql<boolean>`${kycAgeExpr} <= ${kycAgeMax}`);
    }

    if (docStatus?.length) {
      const docPredicates = docStatus
        .map((key) => {
          switch (key) {
            case "identity_missing":
              return sql<boolean>`${identityStatusExpr} = 'missing'`;
            case "business_missing":
              return sql<boolean>`${businessStatusExpr} = 'missing'`;
            case "bank_missing":
              return sql<boolean>`${bankStatusExpr} = 'missing'`;
            case "any_missing":
              return sql<boolean>`(${identityStatusExpr} = 'missing' OR ${businessStatusExpr} = 'missing' OR ${bankStatusExpr} = 'missing')`;
            case "any_pending":
              return sql<boolean>`(${identityStatusExpr} = 'pending' OR ${businessStatusExpr} = 'pending' OR ${bankStatusExpr} = 'pending')`;
            case "all_verified":
              return sql<boolean>`(${identityStatusExpr} = 'verified' AND ${businessStatusExpr} = 'verified' AND ${bankStatusExpr} = 'verified')`;
          }
        })
        .filter(Boolean);
      if (docPredicates.length === 1) conditions.push(docPredicates[0]);
      else if (docPredicates.length > 1) conditions.push(or(...docPredicates));
    }

    if (riskLevel?.length) {
      if (riskLevel.length === 1) {
        conditions.push(sql<boolean>`${riskLevelExpr} = ${riskLevel[0]}`);
      } else {
        conditions.push(or(...riskLevel.map((level) => sql<boolean>`${riskLevelExpr} = ${level}`)));
      }
    }

    const where = conditions.length ? and(...conditions) : undefined;

    // Sorting
    let orderBy;
    switch (sort) {
      case "kyc_status":
        orderBy = order === "asc" ? asc(providers.kycStatus) : desc(providers.kycStatus);
        break;
      case "risk_score":
        orderBy = order === "asc" ? asc(riskScoreExpr) : desc(riskScoreExpr);
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

    const [countRow] = await db
      .select({ totalCount: sql<number>`COUNT(*)` })
      .from(providers)
      .leftJoin(users, eq(providers.userId, users.id))
      .leftJoin(bookingAgg, eq(bookingAgg.providerId, providers.id))
      .leftJoin(reviewAgg, eq(reviewAgg.providerId, providers.id))
      .leftJoin(incidentAgg, eq(incidentAgg.providerId, providers.id))
      .where(where);

    const totalCount = Number(countRow?.totalCount ?? 0);

    const rows = await db
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
        totalBookings: totalBookingsExpr,
        completionRate: completionRateExpr,
        cancellationRate: cancellationRateExpr,
        totalReviews: sql<number>`COALESCE(${reviewAgg.totalReviews}, 0)`,
        avgRating: sql<number>`COALESCE(${reviewAgg.avgRating}, 0)`,
        totalIncidents: sql<number>`COALESCE(${incidentAgg.totalIncidents}, 0)`,
        unresolvedIncidents: unresolvedIncidentsExpr,
        kycAge: kycAgeExpr,
        riskScore: riskScoreExpr,
        riskLevel: riskLevelExpr,
        identityStatus: identityStatusExpr,
        businessStatus: businessStatusExpr,
        bankStatus: bankStatusExpr,
      })
      .from(providers)
      .leftJoin(users, eq(providers.userId, users.id))
      .leftJoin(bookingAgg, eq(bookingAgg.providerId, providers.id))
      .leftJoin(reviewAgg, eq(reviewAgg.providerId, providers.id))
      .leftJoin(incidentAgg, eq(incidentAgg.providerId, providers.id))
      .where(where)
      .orderBy(orderBy)
      .limit(pageSize)
      .offset(offset);

    const statsRow = await db
      .select({
        verifiedProviders: sql<number>`COUNT(*) FILTER (WHERE ${providers.kycStatus} = 'verified')`,
        pendingReview: sql<number>`COUNT(*) FILTER (WHERE ${providers.kycStatus} = 'pending_review')`,
        rejectedProviders: sql<number>`COUNT(*) FILTER (WHERE ${providers.kycStatus} = 'rejected')`,
        notStarted: sql<number>`COUNT(*) FILTER (WHERE ${providers.kycStatus} = 'not_started')`,
        inProgress: sql<number>`COUNT(*) FILTER (WHERE ${providers.kycStatus} = 'in_progress')`,
        criticalRisk: sql<number>`COUNT(*) FILTER (WHERE ${riskLevelExpr} = 'critical')`,
        highRisk: sql<number>`COUNT(*) FILTER (WHERE ${riskLevelExpr} = 'high')`,
        documentsMissing: sql<number>`COUNT(*) FILTER (WHERE (${identityStatusExpr} = 'missing' OR ${businessStatusExpr} = 'missing' OR ${bankStatusExpr} = 'missing'))`,
      })
      .from(providers)
      .leftJoin(users, eq(providers.userId, users.id))
      .leftJoin(bookingAgg, eq(bookingAgg.providerId, providers.id))
      .leftJoin(reviewAgg, eq(reviewAgg.providerId, providers.id))
      .leftJoin(incidentAgg, eq(incidentAgg.providerId, providers.id))
      .where(where)
      .then((r) => r[0]);

    const providersPage = rows.map((row) => {
      const missingDocuments: string[] = [];
      if (row.identityStatus === "missing") missingDocuments.push("Identity Document");
      if (row.businessStatus === "missing") missingDocuments.push("Business Document");
      if (row.bankStatus === "missing") missingDocuments.push("Bank Account Verification");

      const totalSteps = 4;
      let completedSteps = 0;
      if (row.kycStatus !== "not_started") completedSteps++;
      if (row.identityDocumentUrl) completedSteps++;
      if (row.businessDocumentUrl) completedSteps++;
      if (row.stripeConnectId) completedSteps++;

      const kycCompletionPercentage = Math.round((completedSteps / totalSteps) * 100);

      const stripeOnboardingStatus = row.stripeConnectId
        ? row.chargesEnabled && row.payoutsEnabled
          ? ("completed" as const)
          : ("in_progress" as const)
        : ("not_started" as const);

      return {
        id: row.id,
        businessName: row.businessName,
        handle: row.handle,
        status: row.status,
        kycStatus: row.kycStatus,
        kycSubmittedAt: row.kycSubmittedAt,
        kycVerifiedAt: row.kycVerifiedAt,
        identityDocumentUrl: row.identityDocumentUrl,
        businessDocumentUrl: row.businessDocumentUrl,
        stripeConnectId: row.stripeConnectId,
        chargesEnabled: row.chargesEnabled,
        payoutsEnabled: row.payoutsEnabled,
        trustScore: Number(row.trustScore ?? 0),
        riskScore: Number(row.riskScore ?? 0),
        riskLevel: row.riskLevel,
        totalBookings: Number(row.totalBookings ?? 0),
        completionRate: Number(row.completionRate ?? 0),
        cancellationRate: Number(row.cancellationRate ?? 0),
        totalReviews: Number(row.totalReviews ?? 0),
        avgRating: Number(row.avgRating ?? 0),
        totalIncidents: Number(row.totalIncidents ?? 0),
        unresolvedIncidents: Number(row.unresolvedIncidents ?? 0),
        createdAt: row.createdAt,
        daysActive: Math.floor((Date.now() - row.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
        kycCompletionPercentage,
        missingDocuments,
        kycAge: Number(row.kycAge ?? 0),
        kycRiskFactors: [],
        kycRecommendations: [],
        kycAlerts: [],
        documentVerificationStatus: {
          identity: row.identityStatus,
          business: row.businessStatus,
          bank: row.bankStatus,
        },
        stripeOnboardingStatus,
        complianceFlags: [],
        user: row.user,
      };
    });

    return NextResponse.json({
      providers: providersPage,
      analytics: {
        platformKycStats: {
          totalProviders: totalCount,
          verifiedProviders: Number(statsRow?.verifiedProviders ?? 0),
          pendingReview: Number(statsRow?.pendingReview ?? 0),
          rejectedProviders: Number(statsRow?.rejectedProviders ?? 0),
          notStarted: Number(statsRow?.notStarted ?? 0),
          inProgress: Number(statsRow?.inProgress ?? 0),
          avgKycCompletionTime: 0,
          kycCompletionRate: totalCount > 0 ? Math.round(((Number(statsRow?.verifiedProviders ?? 0) / totalCount) * 100) * 10) / 10 : 0,
        },
        riskDistribution: {
          critical: Number(statsRow?.criticalRisk ?? 0),
          high: Number(statsRow?.highRisk ?? 0),
          medium: 0,
          low: 0,
        },
        documentStatus: {
          identityVerified: 0,
          businessVerified: 0,
          bankVerified: 0,
          documentsMissing: Number(statsRow?.documentsMissing ?? 0),
        },
        timelineMetrics: {
          kycSubmissions30d: 0,
          kycVerifications30d: 0,
          kycRejections30d: 0,
          avgProcessingTime: 0,
        },
      },
      page,
      pageSize,
      totalCount,
    });

  } catch (error) {
    console.error("Error fetching KYC providers:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}