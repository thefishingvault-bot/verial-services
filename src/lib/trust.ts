// --- TRUST WEIGHTS (as per spec) ---
export const TRUST_WEIGHTS = {
  VERIFICATION: 0.3, // 30%
  REVIEWS: 0.4,      // 40%
  COMPLETION: 0.25,  // 25%
  TENURE: 0.05,      // 5%
};

export const getTrustTierFromScore = (score: number): "bronze" | "silver" | "gold" | "platinum" => {
  if (score >= 85) return "platinum";
  if (score >= 70) return "gold";
  if (score >= 50) return "silver";
  return "bronze";
};

export const getTrustTier = getTrustTierFromScore;

export const calculateTrustScore = async (providerId: string): Promise<number> => {
  console.log(`[TRUST_LIB] Calculating score for ${providerId}...`);

  try {
    // Import db here to avoid circular dependencies
    const { db } = await import("@/lib/db");
    const { providers, reviews, bookings, trustIncidents } = await import("@/db/schema");
    const { eq, and, sql } = await import("drizzle-orm");

    // 1. Get provider data
    const provider = await db
      .select()
      .from(providers)
      .where(eq(providers.id, providerId))
      .limit(1);

    if (provider.length === 0) {
      console.error(`[TRUST_LIB] Provider ${providerId} not found`);
      return 0;
    }

    const providerData = provider[0];

    // 2. Calculate verification score (30%)
    const verificationScore = providerData.kycStatus === "verified" ? 100 :
                             providerData.kycStatus === "pending_review" ? 50 :
                             providerData.kycStatus === "in_progress" ? 25 : 0;

    // 3. Calculate review score (40%)
    const reviewStats = await db
      .select({
        avgRating: sql<number>`AVG(${reviews.rating})`,
        reviewCount: sql<number>`COUNT(*)`,
      })
      .from(reviews)
      .where(and(eq(reviews.providerId, providerId), eq(reviews.isHidden, false)));

    const avgRating = reviewStats[0]?.avgRating || 0;
    const reviewCount = reviewStats[0]?.reviewCount || 0;

    // Review score: base score from rating, bonus for more reviews
    const baseReviewScore = (avgRating / 5) * 100; // Convert 1-5 rating to 0-100
    const reviewVolumeBonus = Math.min(reviewCount * 2, 20); // Up to 20 points for reviews
    const reviewScore = Math.min(baseReviewScore + reviewVolumeBonus, 100);

    // 4. Calculate completion score (25%)
    const bookingStats = await db
      .select({
        totalBookings: sql<number>`COUNT(*)`,
        completedBookings: sql<number>`COUNT(CASE WHEN ${bookings.status} = 'completed' THEN 1 END)`,
      })
      .from(bookings)
      .where(eq(bookings.providerId, providerId));

    const totalBookings = bookingStats[0]?.totalBookings || 0;
    const completedBookings = bookingStats[0]?.completedBookings || 0;
    const completionRate = totalBookings > 0 ? (completedBookings / totalBookings) * 100 : 100;
    const completionScore = totalBookings > 0 ? completionRate : 80; // Provide a moderated baseline for new providers

    // 5. Calculate tenure score (5%)
    const createdDate = providerData.createdAt;
    const daysSinceCreation = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
    const tenureScore = Math.min(daysSinceCreation / 30, 12) * (100 / 12); // 1 year max

    // 6. Calculate base score from weights
    const baseScore = (
      verificationScore * TRUST_WEIGHTS.VERIFICATION +
      reviewScore * TRUST_WEIGHTS.REVIEWS +
      completionScore * TRUST_WEIGHTS.COMPLETION +
      tenureScore * TRUST_WEIGHTS.TENURE
    );

    // 7. Apply incident penalties
    const unresolvedIncidents = await db
      .select({
        trustScoreImpact: trustIncidents.trustScoreImpact,
      })
      .from(trustIncidents)
      .where(and(
        eq(trustIncidents.providerId, providerId),
        eq(trustIncidents.resolved, false)
      ));

    let totalPenalty = 0;
    for (const incident of unresolvedIncidents) {
      totalPenalty += incident.trustScoreImpact;
    }

    // 8. Calculate final score (ensure it's between 0-100)
    // Apply a small floor to avoid zeroing brand-new but verified providers
    const prelimScore = baseScore + totalPenalty;
    const finalScore = Math.max(20, Math.min(100, prelimScore));

    console.log(`[TRUST_LIB] Provider ${providerId} score: ${finalScore} (base: ${baseScore}, penalty: ${totalPenalty})`);

    return Math.round(finalScore);

  } catch (error) {
    console.error(`[TRUST_LIB] Error calculating trust score for ${providerId}:`, error);
    return 0;
  }
};

