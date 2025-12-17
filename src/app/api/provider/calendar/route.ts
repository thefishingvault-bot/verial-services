import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { providers } from "@/db/schema";
import { db } from "@/lib/db";
import { loadProviderCalendar } from "@/lib/provider-calendar";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const provider = await db.query.providers.findFirst({ where: eq(providers.userId, userId) });
    if (!provider) return new NextResponse("Provider not found", { status: 404 });

    const startParam = req.nextUrl.searchParams.get("start");
    const endParam = req.nextUrl.searchParams.get("end");

    const startRaw = startParam ? new Date(startParam) : undefined;
    const endRaw = endParam ? new Date(endParam) : undefined;
    const start = startRaw && !Number.isNaN(startRaw.getTime()) ? startRaw : undefined;
    const end = endRaw && !Number.isNaN(endRaw.getTime()) ? endRaw : undefined;

    const data = await loadProviderCalendar({ providerId: provider.id, rangeStart: start, rangeEnd: end });

    return NextResponse.json(data);
  } catch (error) {
    console.error("[API_PROVIDER_CALENDAR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
