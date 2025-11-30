import { db } from "@/lib/db";
import { providers, trustIncidents, bookings, reviews, providerSuspensions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export interface ProviderRiskMetrics {
  providerId: string;
  trustScore: number;
  unresolvedIncidents: number;
  recentIncidents: number;
  completionRate: number;
  cancellationRate: number;
  totalSuspensions: number;
  avgRating: number;
  totalBookings: number;
  daysActive: number;
}

export interface RiskAssessment {
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  riskFactors: string[];
  recommendations: string[];
  alerts: string[];
}

export class RiskScoringEngine {
  private static readonly WEIGHTS = {
    TRUST_SCORE: 0.35,
    INCIDENT_HISTORY: 0.25,
    PERFORMANCE_METRICS: 0.25,
    SUSPENSION_HISTORY: 0.10,
    TENURE_BONUS: 0.05,
  };

  private static readonly THRESHOLDS = {
    CRITICAL: 80,
    HIGH: 60,
    MEDIUM: 30,
    LOW: 0,
  };

  /**
   * Calculate comprehensive risk score for a provider
   */
  static async calculateRiskScore(providerId: string): Promise<RiskAssessment> {
    const metrics = await this.getProviderMetrics(providerId);
    const riskScore = this.computeRiskScore(metrics);
    const riskLevel = this.getRiskLevel(riskScore);
    const riskFactors = this.identifyRiskFactors(metrics);
    const recommendations = this.generateRecommendations(metrics, riskLevel);
    const alerts = this.generateAlerts(metrics, riskLevel);

    return {
      riskScore,
      riskLevel,
      riskFactors,
      recommendations,
      alerts,
    };
  }

  /**
   * Get all relevant metrics for risk assessment
   */
  private static async getProviderMetrics(providerId: string): Promise<ProviderRiskMetrics> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get provider basic info
    const provider = await db
      .select({
        trustScore: providers.trustScore,
        createdAt: providers.createdAt,
      })
      .from(providers)
      .where(eq(providers.id, providerId))
      .limit(1);

    if (provider.length === 0) {
      throw new Error(`Provider ${providerId} not found`);
    }

    // Get incident metrics
    const incidentMetrics = await db
      .select({
        unresolvedIncidents: sql<number>`count(case when ${trustIncidents.resolved} = false then 1 end)`,
        recentIncidents: sql<number>`count(case when ${trustIncidents.createdAt} >= ${thirtyDaysAgo} then 1 end)`,
      })
      .from(trustIncidents)
      .where(eq(trustIncidents.providerId, providerId));

    // Get performance metrics
    const performanceMetrics = await db
      .select({
        totalBookings: sql<number>`count(*)`,
        completedBookings: sql<number>`count(case when ${bookings.status} = 'completed' then 1 end)`,
        cancelledBookings: sql<number>`count(case when ${bookings.status} = 'canceled' then 1 end)`,
        avgRating: sql<number>`avg(${reviews.rating})`,
      })
      .from(bookings)
      .leftJoin(reviews, eq(bookings.id, reviews.bookingId))
      .where(eq(bookings.providerId, providerId));

    // Get suspension history
    const suspensionMetrics = await db
      .select({
        totalSuspensions: sql<number>`count(*)`,
      })
      .from(providerSuspensions)
      .where(eq(providerSuspensions.providerId, providerId));

    const totalBookings = performanceMetrics[0]?.totalBookings || 0;
    const completedBookings = performanceMetrics[0]?.completedBookings || 0;
    const cancelledBookings = performanceMetrics[0]?.cancelledBookings || 0;

    const completionRate = totalBookings > 0 ? (completedBookings / totalBookings) * 100 : 100;
    const cancellationRate = totalBookings > 0 ? (cancelledBookings / totalBookings) * 100 : 0;

    const daysActive = Math.floor((now.getTime() - provider[0].createdAt.getTime()) / (1000 * 60 * 60 * 24));

    return {
      providerId,
      trustScore: provider[0].trustScore || 0,
      unresolvedIncidents: incidentMetrics[0]?.unresolvedIncidents || 0,
      recentIncidents: incidentMetrics[0]?.recentIncidents || 0,
      completionRate,
      cancellationRate,
      totalSuspensions: suspensionMetrics[0]?.totalSuspensions || 0,
      avgRating: performanceMetrics[0]?.avgRating || 0,
      totalBookings,
      daysActive,
    };
  }

  /**
   * Compute the overall risk score from metrics
   */
  private static computeRiskScore(metrics: ProviderRiskMetrics): number {
    let riskScore = 0;

    // Trust score component (lower trust = higher risk)
    const trustRisk = Math.max(0, 100 - metrics.trustScore);
    riskScore += trustRisk * this.WEIGHTS.TRUST_SCORE;

    // Incident history component
    const incidentRisk = Math.min(
      (metrics.unresolvedIncidents * 15) + (metrics.recentIncidents * 10),
      100
    );
    riskScore += incidentRisk * this.WEIGHTS.INCIDENT_HISTORY;

    // Performance metrics component
    const performanceRisk = Math.max(0, (80 - metrics.completionRate) + metrics.cancellationRate);
    riskScore += Math.min(performanceRisk, 100) * this.WEIGHTS.PERFORMANCE_METRICS;

    // Suspension history component
    const suspensionRisk = Math.min(metrics.totalSuspensions * 20, 100);
    riskScore += suspensionRisk * this.WEIGHTS.SUSPENSION_HISTORY;

    // Tenure bonus (longer active = lower risk)
    const tenureBonus = Math.min(metrics.daysActive / 365 * 20, 20);
    riskScore -= tenureBonus * this.WEIGHTS.TENURE_BONUS;

    return Math.max(0, Math.min(100, Math.round(riskScore)));
  }

  /**
   * Determine risk level from score
   */
  private static getRiskLevel(riskScore: number): "low" | "medium" | "high" | "critical" {
    if (riskScore >= this.THRESHOLDS.CRITICAL) return "critical";
    if (riskScore >= this.THRESHOLDS.HIGH) return "high";
    if (riskScore >= this.THRESHOLDS.MEDIUM) return "medium";
    return "low";
  }

  /**
   * Identify specific risk factors
   */
  private static identifyRiskFactors(metrics: ProviderRiskMetrics): string[] {
    const factors: string[] = [];

    if (metrics.trustScore < 60) {
      factors.push(`Low trust score (${metrics.trustScore})`);
    }

    if (metrics.unresolvedIncidents > 0) {
      factors.push(`${metrics.unresolvedIncidents} unresolved trust incidents`);
    }

    if (metrics.recentIncidents > 2) {
      factors.push(`${metrics.recentIncidents} incidents in last 30 days`);
    }

    if (metrics.completionRate < 80) {
      factors.push(`Low completion rate (${metrics.completionRate.toFixed(1)}%)`);
    }

    if (metrics.cancellationRate > 15) {
      factors.push(`High cancellation rate (${metrics.cancellationRate.toFixed(1)}%)`);
    }

    if (metrics.totalSuspensions > 0) {
      factors.push(`${metrics.totalSuspensions} previous suspensions`);
    }

    if (metrics.avgRating < 4.0 && metrics.totalBookings > 5) {
      factors.push(`Low average rating (${metrics.avgRating.toFixed(1)} stars)`);
    }

    return factors;
  }

  /**
   * Generate recommendations based on risk level and metrics
   */
  private static generateRecommendations(metrics: ProviderRiskMetrics, riskLevel: string): string[] {
    const recommendations: string[] = [];

    if (riskLevel === "critical") {
      recommendations.push("Immediate suspension recommended");
      recommendations.push("Conduct thorough review of all recent bookings");
      recommendations.push("Contact provider for explanation of trust incidents");
    } else if (riskLevel === "high") {
      recommendations.push("Enhanced monitoring required");
      recommendations.push("Review recent trust incidents");
      recommendations.push("Consider temporary suspension if issues persist");
    }

    if (metrics.completionRate < 80) {
      recommendations.push("Monitor booking completion patterns");
      recommendations.push("Provide performance improvement guidance");
    }

    if (metrics.unresolvedIncidents > 0) {
      recommendations.push("Resolve outstanding trust incidents");
      recommendations.push("Review incident details for patterns");
    }

    if (metrics.cancellationRate > 15) {
      recommendations.push("Investigate frequent cancellation reasons");
      recommendations.push("Consider booking policy review");
    }

    return recommendations;
  }

  /**
   * Generate automated alerts based on risk level
   */
  private static generateAlerts(metrics: ProviderRiskMetrics, riskLevel: string): string[] {
    const alerts: string[] = [];

    if (riskLevel === "critical") {
      alerts.push("🚨 CRITICAL RISK: Immediate action required");
    } else if (riskLevel === "high") {
      alerts.push("⚠️ HIGH RISK: Enhanced monitoring activated");
    }

    if (metrics.unresolvedIncidents > 3) {
      alerts.push(`Multiple unresolved incidents (${metrics.unresolvedIncidents})`);
    }

    if (metrics.recentIncidents > 5) {
      alerts.push(`High incident frequency (${metrics.recentIncidents} in 30 days)`);
    }

    if (metrics.completionRate < 50) {
      alerts.push(`Severely low completion rate (${metrics.completionRate.toFixed(1)}%)`);
    }

    return alerts;
  }

  /**
   * Get risk thresholds for configuration
   */
  static getRiskThresholds() {
    return this.THRESHOLDS;
  }

  /**
   * Get risk scoring weights for configuration
   */
  static getRiskWeights() {
    return this.WEIGHTS;
  }
}