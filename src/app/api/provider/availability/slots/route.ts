import { db } from "@/lib/db";
import { bookings, providerAvailabilities, providerTimeOffs } from "@/db/schema";
import { NextResponse } from "next/server";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { getDay, addMinutes, isBefore, format, addDays } from "date-fns";
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

    const timeOffs = await db.query.providerTimeOffs.findMany({
      where: eq(providerTimeOffs.providerId, providerId),
    });

    const schedules = await db.query.providerAvailabilities.findMany({
      where: and(eq(providerAvailabilities.providerId, providerId), eq(providerAvailabilities.isEnabled, true)),
    });
    const timeZoneAwareSchedules = schedules.map((s) => ({ ...s }));

    const dayStartUtc = new Date(`${date}T00:00:00Z`);
    const dayEndUtc = new Date(`${date}T23:59:59.999Z`);

    const busyBookings = await db.query.bookings.findMany({
      where: and(
        eq(bookings.providerId, providerId),
        gte(bookings.scheduledDate, dayStartUtc),
        lte(bookings.scheduledDate, dayEndUtc),
        inArray(bookings.status, ["accepted", "paid", "completed"]),
      ),
      columns: { scheduledDate: true },
    });

    const busySlots = new Set(
      busyBookings
        .filter((b) => b.scheduledDate)
        .map((b) => new Date(b.scheduledDate as Date).toISOString()),
    );

    const computeSlotsForDate = (target: Date) => {
      const dayIndex = getDay(target);
      const requestedDay = DAY_OF_WEEK_INDEX[dayIndex];

      const schedule = timeZoneAwareSchedules.find((s) => s.dayOfWeek === requestedDay);
      if (!schedule) return { slots: [] as string[], blockedSlots: [] as string[] };

      const dateString = format(target, "yyyy-MM-dd");
      let currentSlot = new Date(`${dateString}T${schedule.startTime}`);
      const endTime = new Date(`${dateString}T${schedule.endTime}`);

      const slots: string[] = [];
      const blockedSlots: string[] = [];

      while (isBefore(currentSlot, endTime)) {
        const slotUtc = fromZonedTime(currentSlot, TIMEZONE).toISOString();

        const isBlocked = timeOffs.some((off) => {
          const offStart = new Date(off.startTime).toISOString();
          const offEnd = new Date(off.endTime).toISOString();
          return slotUtc >= offStart && slotUtc < offEnd;
        });

        const isBooked = busySlots.has(slotUtc);

        if (isBlocked || isBooked) {
          blockedSlots.push(slotUtc);
        } else {
          slots.push(slotUtc);
        }

        currentSlot = addMinutes(currentSlot, 30);
      }

      return { slots, blockedSlots };
    };

    const targetDateNZ = toZonedTime(new Date(`${date}T00:00:00`), TIMEZONE);

    const { slots, blockedSlots } = computeSlotsForDate(targetDateNZ);

    let nextAvailableDate: string | null = null;
    if (slots.length === 0) {
      for (let i = 1; i <= 30; i++) {
        const nextDate = addDays(targetDateNZ, i);
        const { slots: futureSlots } = computeSlotsForDate(nextDate);
        if (futureSlots.length > 0) {
          nextAvailableDate = format(nextDate, "yyyy-MM-dd");
          break;
        }
      }
    }

    return NextResponse.json({ availableSlots: slots, blockedSlots, nextAvailableDate });
  } catch (error) {
    console.error("[API_AVAILABILITY_SLOTS]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

