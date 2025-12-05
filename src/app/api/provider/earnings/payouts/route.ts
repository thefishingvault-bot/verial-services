import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { providerPayouts, providers } from "@/db/schema";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
    });

    if (!provider) {
      return new NextResponse("Provider not found", { status: 404 });
    }

    const payouts = await db
      .select()
      .from(providerPayouts)
      .where(eq(providerPayouts.providerId, provider.id))
      .orderBy(desc(providerPayouts.createdAt))
      .limit(50);

    return NextResponse.json({ payouts, currency: "NZD" });
  } catch (error) {
    console.error("[API_PROVIDER_EARNINGS_PAYOUTS]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
