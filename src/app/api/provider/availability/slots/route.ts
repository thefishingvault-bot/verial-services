import { db } from "@/lib/db";
import { providerAvailabilities, providerTimeOffs } from "@/db/schema";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDay, addMinutes, isBefore, format } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

export const runtime = "nodejs";

const TIMEZONE = "Pacific/Auckland";
const DAY_OF_WEEK_INDEX = [
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
      date?: string; // "YYYY-MM-DD"
    };

    if (!providerId || !date) {
      return new NextResponse("Missing providerId or date", { status: 400 });
    }

    // 1. Interpret the incoming date as an NZ date
    const targetDateNZ = toZonedTime(new Date(`${date}T00:00:00`), TIMEZONE);

    const dayIndex = getDay(targetDateNZ);
    const requestedDay = DAY_OF_WEEK_INDEX[dayIndex];

    // 2. Get provider's recurring schedule for that NZ day
    const schedule = await db.query.providerAvailabilities.findFirst({
      where: and(
        eq(providerAvailabilities.providerId, providerId),
        eq(providerAvailabilities.dayOfWeek, requestedDay),
        eq(providerAvailabilities.isEnabled, true),
      ),
    });

    if (!schedule) {
      return NextResponse.json({ availableSlots: [] });
    }

    // 3. Fetch all time-offs for this provider (filter in JS with timezone-aware dates)
    const timeOffs = await db.query.providerTimeOffs.findMany({
      where: eq(providerTimeOffs.providerId, providerId),
    });

    // 4. Generate 30-minute slots in NZ time
    const slots: string[] = [];

    const dateString = format(targetDateNZ, "yyyy-MM-dd");

    let currentSlot = new Date(`${dateString}T${schedule.startTime}`);
    const endTime = new Date(`${dateString}T${schedule.endTime}`);

    while (isBefore(currentSlot, endTime)) {
      // Convert NZ local slot to UTC ISO for storage / comparison
      const slotUtc = fromZonedTime(currentSlot, TIMEZONE).toISOString();

      const isBlocked = timeOffs.some((off) => {
        const offStart = new Date(off.startTime).toISOString();
        const offEnd = new Date(off.endTime).toISOString();
        return slotUtc >= offStart && slotUtc < offEnd;
      });

      if (!isBlocked) {
        slots.push(slotUtc);
      }

      currentSlot = addMinutes(currentSlot, 30);
    }

    return NextResponse.json({ availableSlots: slots });
  } catch (error) {
    console.error("[API_AVAILABILITY_SLOTS]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

