import { and, between, eq, inArray, lte, gte, isNotNull } from "drizzle-orm";
import { startOfMonth, endOfMonth } from "date-fns";
import { db } from "@/lib/db";
import { bookings, providerTimeOffs } from "@/db/schema";
import { type CalendarEvent } from "@/lib/provider-calendar-shared";

export async function loadProviderCalendar(params: {
  providerId: string;
  rangeStart?: Date;
  rangeEnd?: Date;
}): Promise<{ bookings: CalendarEvent[]; timeOffs: CalendarEvent[] }> {
  const { providerId, rangeStart, rangeEnd } = params;
  const start = rangeStart ?? startOfMonth(new Date());
  const end = rangeEnd ?? endOfMonth(new Date());

  const calendarBookings = await db.query.bookings.findMany({
    where: and(
      eq(bookings.providerId, providerId),
      isNotNull(bookings.scheduledDate),
      between(bookings.scheduledDate, start, end),
      inArray(bookings.status, ["pending", "accepted", "paid", "completed"]),
    ),
    columns: {
      id: true,
      status: true,
      serviceId: true,
      scheduledDate: true,
    },
  });

  const timeOffs = await db.query.providerTimeOffs.findMany({
    where: and(
      eq(providerTimeOffs.providerId, providerId),
      lte(providerTimeOffs.startTime, end),
      gte(providerTimeOffs.endTime, start),
    ),
    columns: {
      id: true,
      startTime: true,
      endTime: true,
      reason: true,
    },
  });

  const bookingEvents: CalendarEvent[] = calendarBookings
    .filter((b) => !!b.scheduledDate)
    .map((b) => ({
      id: b.id,
      type: "booking",
      status: b.status,
      start: b.scheduledDate as Date,
      end: b.scheduledDate as Date,
      title: "Booking",
    }));

  const timeOffEvents: CalendarEvent[] = timeOffs.map((t) => ({
    id: t.id,
    type: "time_off",
    status: "time_off",
    start: t.startTime,
    end: t.endTime,
    title: t.reason ?? "Time off",
  }));

  return { bookings: bookingEvents, timeOffs: timeOffEvents };
}
