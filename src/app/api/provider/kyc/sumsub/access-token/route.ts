import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { safeSumsubRequest, type SumsubAccessTokenResponse } from "@/lib/sumsub";

export const runtime = "nodejs";

export async function POST() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
      columns: { id: true, userId: true, verificationStatus: true },
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

    const response = await safeSumsubRequest<SumsubAccessTokenResponse & Record<string, unknown>>({
      context: "API_SUMSUB_ACCESS_TOKEN",
      method: "POST",
      pathWithQuery: "/resources/accessTokens/sdk",
      body: {
        userId: provider.userId,
        levelName,
        ttlInSecs,
      },
      extraLogFields: {
        userId,
        providerId: provider.id,
      },
    });

    if (!response.ok) {
      await db
        .update(providers)
        .set({
          verificationStatus: "unavailable",
          updatedAt: new Date(),
        })
        .where(eq(providers.id, provider.id));

      return NextResponse.json(
        {
          ok: false,
          error: response.error,
          kind: response.kind,
          statusCode: response.statusCode,
          message: "Verification temporarily unavailable. You can continue setting up your profile.",
        },
        { status: 200 },
      );
    }

    if (provider.verificationStatus === "unavailable") {
      await db
        .update(providers)
        .set({
          verificationStatus: "pending",
          updatedAt: new Date(),
        })
        .where(eq(providers.id, provider.id));
    }

    return NextResponse.json({ ok: true, ...response.data });
  } catch (error) {
    console.error("[API_SUMSUB_ACCESS_TOKEN] Error generating access token:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
