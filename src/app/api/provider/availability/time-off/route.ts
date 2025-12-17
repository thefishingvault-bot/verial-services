import { db } from "@/lib/db";
import { bookings, providerTimeOffs, providers } from "@/db/schema";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, between, eq, gte, inArray, lte } from "drizzle-orm";
import { hasOverlap } from "@/lib/time-off-overlap";

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
      where: eq(providers.userId, userId),
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

    let start = new Date(startTime);
    const end = new Date(endTime);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return new NextResponse("Invalid start or end time", { status: 400 });
    }

    if (start >= end) {
      return new NextResponse("startTime must be before endTime", { status: 400 });
    }

    const now = new Date();
    if (end <= now) {
      return new NextResponse("Time off must end in the future", { status: 400 });
    }

    if (start < now) {
      start = now;
      if (start >= end) {
        return new NextResponse("startTime must be before endTime", { status: 400 });
      }
    }

    const BLOCKED_STATUSES = ["accepted", "paid"] as const;

    const overlappingBookings = await db.query.bookings.findMany({
      where: and(
        eq(bookings.providerId, provider.id),
        between(bookings.scheduledDate, start, end),
        inArray(bookings.status, BLOCKED_STATUSES),
      ),
      columns: { scheduledDate: true },
    });

    if (
      hasOverlap(
        overlappingBookings.map((b) => ({
          start: b.scheduledDate as Date,
          end: b.scheduledDate as Date,
        })),
        start,
        end,
      )
    ) {
      return new NextResponse("Time off overlaps an accepted/paid booking", { status: 400 });
    }

    const overlappingTimeOffs = await db.query.providerTimeOffs.findMany({
      where: and(
        eq(providerTimeOffs.providerId, provider.id),
        lte(providerTimeOffs.startTime, end),
        gte(providerTimeOffs.endTime, start),
      ),
      columns: { startTime: true, endTime: true },
    });

    if (
      hasOverlap(
        overlappingTimeOffs.map((t) => ({ start: t.startTime, end: t.endTime })),
        start,
        end,
      )
    ) {
      return new NextResponse("Time off overlaps an existing block", { status: 400 });
    }

    const newTimeOff = {
      id: generateId(),
      providerId: provider.id,
      reason: reason ?? null,
      startTime: start,
      endTime: end,
    };

    await db.insert(providerTimeOffs).values(newTimeOff);

    console.log(`[API_TIMEOFF_POST] Added time off for Provider ${provider.id}`);
    return NextResponse.json(newTimeOff);
  } catch (error) {
    console.error("[API_TIMEOFF_POST]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

