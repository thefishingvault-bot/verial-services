import { db } from "@/lib/db";
import { providerAvailabilities, providerTimeOffs } from "@/db/schema";
import { NextResponse } from "next/server";
import { eq, and, lte, gte } from "drizzle-orm";
import { getDay, parse, set, addMinutes } from "date-fns";

export const runtime = "nodejs";

// Helper to get day of the week
const dayOfWeekIndex = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export async function POST(req: Request) {
  try {
    const { providerId, date } = (await req.json()) as {
      providerId?: string;
      date?: string; // e.g. "2025-11-20"
    };

    if (!providerId || !date) {
      return new NextResponse("Missing providerId or date", { status: 400 });
    }

    const selectedDate = new Date(date);
    const requestedDay = dayOfWeekIndex[getDay(selectedDate)];

    // 1. Get the provider's recurring schedule for that day
    const schedule = await db.query.providerAvailabilities.findFirst({
      where: and(
        eq(providerAvailabilities.providerId, providerId),
        eq(providerAvailabilities.dayOfWeek, requestedDay),
        eq(providerAvailabilities.isEnabled, true),
      ),
    });

    if (!schedule) {
      // Provider not available this day
      return NextResponse.json({ availableSlots: [] });
    }

    // 2. Get all time-offs for that provider on that specific day
    const dayStart = set(selectedDate, { hours: 0, minutes: 0, seconds: 0, milliseconds: 0 });
    const dayEnd = set(selectedDate, { hours: 23, minutes: 59, seconds: 59, milliseconds: 999 });

    const timeOffs = await db.query.providerTimeOffs.findMany({
      where: and(
        eq(providerTimeOffs.providerId, providerId),
        lte(providerTimeOffs.startTime, dayEnd),
        gte(providerTimeOffs.endTime, dayStart),
      ),
    });

    // 3. Generate 30-minute slots (simplified for MVP)
    const slots: string[] = [];

    let currentTime = parse(String(schedule.startTime), "HH:mm:ss", new Date());
    const endTime = parse(String(schedule.endTime), "HH:mm:ss", new Date());

    while (currentTime < endTime) {
      const slotTime = set(selectedDate, {
        hours: currentTime.getHours(),
        minutes: currentTime.getMinutes(),
        seconds: 0,
        milliseconds: 0,
      });

      // Check if this slot conflicts with a time-off
      const isBlocked = timeOffs.some((to) => {
        const offStart = new Date(to.startTime);
        const offEnd = new Date(to.endTime);
        return slotTime >= offStart && slotTime < offEnd;
      });

      if (!isBlocked) {
        slots.push(slotTime.toISOString());
      }

      currentTime = addMinutes(currentTime, 30); // 30-min intervals
    }

    return NextResponse.json({ availableSlots: slots });
  } catch (error) {
    console.error("[API_AVAILABILITY_SLOTS]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

