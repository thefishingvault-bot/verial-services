import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, between, eq, inArray, lte, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, providerTimeOffs, providers } from "@/db/schema";
import { hasOverlap } from "@/lib/time-off-overlap";

export const runtime = "nodejs";

const BLOCKED_STATUSES = ["accepted", "paid"] as const;

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const provider = await db.query.providers.findFirst({ where: eq(providers.userId, userId) });
    if (!provider) return new NextResponse("Provider not found", { status: 404 });

    const body = (await req.json()) as {
      startTime?: string;
      endTime?: string;
      start?: string;
      end?: string;
      reason?: string;
    };

    const rawStart = body.startTime ?? body.start;
    const rawEnd = body.endTime ?? body.end;

    if (!rawStart || !rawEnd) {
      return new NextResponse("Missing startTime or endTime", { status: 400 });
    }

    let startTime = new Date(rawStart);
    const endTime = new Date(rawEnd);

    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      return new NextResponse("Invalid startTime or endTime", { status: 400 });
    }

    if (startTime >= endTime) {
      return new NextResponse("startTime must be before endTime", { status: 400 });
    }

    const now = new Date();

    // Allow creating a time-off block that started earlier today (or a few minutes ago)
    // as long as it still ends in the future; clamp the start to "now" so it can
    // still protect the remaining window.
    if (endTime <= now) {
      return new NextResponse("Time off must end in the future", { status: 400 });
    }

    if (startTime < now) {
      startTime = now;
      if (startTime >= endTime) {
        return new NextResponse("startTime must be before endTime", { status: 400 });
      }
    }

    const overlappingBookings = await db.query.bookings.findMany({
      where: and(
        eq(bookings.providerId, provider.id),
        between(bookings.scheduledDate, startTime, endTime),
        inArray(bookings.status, BLOCKED_STATUSES),
      ),
      columns: { id: true, scheduledDate: true },
    });

    if (hasOverlap(
      overlappingBookings.map((b) => ({ start: b.scheduledDate as Date, end: b.scheduledDate as Date })),
      startTime,
      endTime,
    )) {
      return new NextResponse("Time off overlaps an accepted/paid booking", { status: 400 });
    }

    const overlappingTimeOffs = await db.query.providerTimeOffs.findMany({
      where: and(
        eq(providerTimeOffs.providerId, provider.id),
        lte(providerTimeOffs.startTime, endTime),
        gte(providerTimeOffs.endTime, startTime),
      ),
      columns: { id: true, startTime: true, endTime: true },
    });

    if (hasOverlap(
      overlappingTimeOffs.map((t) => ({ start: t.startTime, end: t.endTime })),
      startTime,
      endTime,
    )) {
      return new NextResponse("Time off overlaps an existing block", { status: 400 });
    }

    const newId = `ptoff_${Date.now()}`;

    const [created] = await db
      .insert(providerTimeOffs)
      .values({
        id: newId,
        providerId: provider.id,
        reason: body.reason ?? null,
        startTime,
        endTime,
      })
      .returning({ id: providerTimeOffs.id, start: providerTimeOffs.startTime, end: providerTimeOffs.endTime, reason: providerTimeOffs.reason });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[API_TIME_OFF_CREATE]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
