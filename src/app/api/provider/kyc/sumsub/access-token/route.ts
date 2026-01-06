import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sumsubRequest, type SumsubAccessTokenResponse } from "@/lib/sumsub";

export const runtime = "nodejs";

export async function POST() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
      columns: { id: true, userId: true },
    });

    if (!provider) {
      return new NextResponse("Provider not found", { status: 404 });
    }

    const levelName = process.env.SUMSUB_KYC_LEVEL_NAME ?? process.env.SUMSUB_LEVEL_NAME;
    if (!levelName) {
      console.error("[API_SUMSUB_ACCESS_TOKEN] Missing SUMSUB_KYC_LEVEL_NAME");
      return new NextResponse("KYC not configured", { status: 500 });
    }

    const ttlInSecs = Number(process.env.SUMSUB_ACCESS_TOKEN_TTL_SECS || 600);

    const response = await sumsubRequest<SumsubAccessTokenResponse & Record<string, unknown>>({
      method: "POST",
      pathWithQuery: "/resources/accessTokens/sdk",
      body: {
        userId: provider.userId,
        levelName,
        ttlInSecs,
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("[API_SUMSUB_ACCESS_TOKEN] Error generating access token:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new NextResponse(message, { status: 500 });
  }
}
