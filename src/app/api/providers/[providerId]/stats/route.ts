import { NextRequest, NextResponse } from "next/server";
import { getProviderStats } from "@/lib/provider-stats";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, context: { params: Promise<{ providerId: string }> }) {
  try {
    const { providerId } = await context.params;
    if (!providerId) {
      return new NextResponse("providerId is required", { status: 400 });
    }

    const stats = await getProviderStats(providerId);
    if (!stats) {
      return new NextResponse("Provider not found", { status: 404 });
    }

    return NextResponse.json(stats);
  } catch (error) {
    console.error("[API_PROVIDER_STATS]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
