import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
      columns: { kycStatus: true, verificationStatus: true },
    });

    if (!provider) {
      return NextResponse.json({ exists: false, kycStatus: null, verificationStatus: null });
    }

    return NextResponse.json({
      exists: true,
      kycStatus: provider.kycStatus,
      verificationStatus: provider.verificationStatus,
    });
  } catch (error) {
    console.error("[API_PROVIDER_KYC_STATUS]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
