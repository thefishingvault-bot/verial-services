// --- TRUST WEIGHTS (as per spec) ---
export const TRUST_WEIGHTS = {
  VERIFICATION: 0.3, // 30%
  REVIEWS: 0.4,      // 40%
  COMPLETION: 0.25,  // 25%
  TENURE: 0.05,      // 5%
};

export const calculateTrustScore = async (providerId: string): Promise<number> => {
  // --- STUBBED LOGIC ---
  // In a real implementation, we would:
  // 1. Fetch the provider from db.query.providers.findFirst(...)
  // 2. Fetch aggregate review data (avg rating, count)
  // 3. Fetch booking completion rate (completed / (completed + canceled))
  // 4. Calculate tenure (days since creation)
  // 5. Apply weights and return a score 0-100

  console.log(`[TRUST_LIB] Calculating score for ${providerId}...`);

  // For now, return a random score for testing
  const randomScore = Math.floor(Math.random() * 70) + 30; // Score between 30 and 100
  return randomScore;
};

