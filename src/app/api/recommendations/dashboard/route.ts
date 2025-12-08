import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getDashboardRecommendations } from "@/lib/recommendations";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const items = await getDashboardRecommendations(userId);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("[API_RECOMMENDATIONS_DASHBOARD]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
