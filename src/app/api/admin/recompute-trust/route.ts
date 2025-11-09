import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { calculateTrustScore } from "@/lib/trust";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Helper to determine trust level from score
const getTrustLevel = (score: number): "bronze" | "silver" | "gold" | "platinum" => {
  if (score >= 95) return "platinum";
  if (score >= 85) return "gold";
  if (score >= 70) return "silver";
  return "bronze";
};

export async function POST(req: Request) {
  // 1. --- CRON SECURITY ---
  const cronKey = req.headers.get("Authorization")?.split("Bearer ")[1];
  const expectedKey = process.env.CRON_KEY;

  if (!expectedKey) {
    console.error("[API_CRON_TRUST] CRON_KEY is not set. Aborting.");
    return new NextResponse("CRON_KEY not configured", { status: 500 });
  }

  if (cronKey !== expectedKey) {
    console.warn(`[API_CRON_TRUST] Invalid cron key received.`);
    return new NextResponse("Unauthorized", { status: 401 });
  }

  console.log("[API_CRON_TRUST] Cron job started. Recomputing all provider trust scores...");

  try {
    // 2. --- GET ALL PROVIDERS ---
    const allProviders = await db.query.providers.findMany({
      columns: { id: true },
    });

    if (allProviders.length === 0) {
      console.log("[API_CRON_TRUST] No providers found to recompute.");
      return NextResponse.json({ ok: true, message: "No providers to update." });
    }

    let updatedCount = 0;

    // 3. --- ITERATE AND UPDATE ---
    for (const provider of allProviders) {
      const newScore = await calculateTrustScore(provider.id);
      const newLevel = getTrustLevel(newScore);

      await db.update(providers)
        .set({
          trustScore: newScore,
          trustLevel: newLevel,
          updatedAt: new Date(),
        })
        .where(eq(providers.id, provider.id));

      updatedCount++;
    }

    console.log(`[API_CRON_TRUST] Cron job finished. Updated ${updatedCount} providers.`);
    return NextResponse.json({ ok: true, updated: updatedCount });

  } catch (error) {
    console.error("[API_CRON_TRUST] Error during trust recomputation:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

