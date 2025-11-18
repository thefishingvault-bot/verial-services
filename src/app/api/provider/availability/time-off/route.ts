import { db } from "@/lib/db";
import { providerTimeOffs } from "@/db/schema";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Helper function to create a unique ID
const generateId = () => `ptoff_${new Date().getTime()}_${Math.random().toString(36).substring(2, 9)}`;

// GET: Fetch the provider's current time-offs
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const provider = await db.query.providers.findFirst({
      where: (p, { eq }) => eq(p.userId, userId),
    });

    if (!provider) {
      return new NextResponse("Provider not found", { status: 404 });
    }

    const timeOffs = await db.query.providerTimeOffs.findMany({
      where: (to, { eq }) => eq(to.providerId, provider.id),
      orderBy: (to, { desc }) => [desc(to.startTime)],
    });

    return NextResponse.json(timeOffs);
  } catch (error) {
    console.error("[API_TIMEOFF_GET]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

// POST: Add a new time-off
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const provider = await db.query.providers.findFirst({
      where: (p, { eq }) => eq(p.userId, userId),
    });

    if (!provider) {
      return new NextResponse("Provider not found", { status: 404 });
    }

    const { reason, startTime, endTime } = (await req.json()) as {
      reason?: string;
      startTime?: string;
      endTime?: string;
    };

    if (!startTime || !endTime) {
      return new NextResponse("Missing start or end time", { status: 400 });
    }

    const newTimeOff = {
      id: generateId(),
      providerId: provider.id,
      reason: reason ?? null,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
    };

    await db.insert(providerTimeOffs).values(newTimeOff);

    console.log(`[API_TIMEOFF_POST] Added time off for Provider ${provider.id}`);
    return NextResponse.json(newTimeOff);
  } catch (error) {
    console.error("[API_TIMEOFF_POST]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

