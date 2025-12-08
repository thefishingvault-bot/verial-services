import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { bookings, providerAvailabilities, providerTimeOffs } from "@/db/schema";
import { db } from "@/lib/db";

const ACCEPTED_STATUSES = ["accepted", "paid"] as const;
const OVERLAP_STATUSES = ["accepted", "paid"] as const;
type DayOfWeek = (typeof providerAvailabilities.dayOfWeek.enumValues)[number];

function toDayOfWeek(date: Date): DayOfWeek {
  const day = date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  if (![
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ].includes(day)) {
    throw new Error("Invalid weekday from proposed date");
  }
  return day as DayOfWeek;
}

function toTimeString(date: Date) {
  return date.toTimeString().slice(0, 8); // HH:MM:SS
}

export async function validateRescheduleProposal(params: {
  bookingId: string;
  providerId: string;
  proposedDate: Date;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { bookingId, providerId, proposedDate } = params;

  // Availability window check
  const dayOfWeek = toDayOfWeek(proposedDate);
  const schedule = await db.query.providerAvailabilities.findFirst({
    where: and(eq(providerAvailabilities.providerId, providerId), eq(providerAvailabilities.dayOfWeek, dayOfWeek)),
  });

  if (!schedule || !schedule.isEnabled) {
    return { ok: false, reason: "Provider is not available on that day" };
  }

  const proposedTime = toTimeString(proposedDate);
  if (proposedTime < schedule.startTime || proposedTime > schedule.endTime) {
    return { ok: false, reason: "Requested time is outside provider hours" };
  }

  // Time off check
  const timeOff = await db.query.providerTimeOffs.findFirst({
    where: and(
      eq(providerTimeOffs.providerId, providerId),
      lte(providerTimeOffs.startTime, proposedDate),
      gte(providerTimeOffs.endTime, proposedDate),
    ),
  });

  if (timeOff) {
    return { ok: false, reason: "Requested time conflicts with provider time off" };
  }

  // Overlap with other accepted/paid bookings
  const overlap = await db.query.bookings.findFirst({
    where: and(
      eq(bookings.providerId, providerId),
      eq(bookings.scheduledDate, proposedDate),
      inArray(bookings.status, OVERLAP_STATUSES),
      ne(bookings.id, bookingId),
    ),
  });

  if (overlap && overlap.id !== bookingId) {
    return { ok: false, reason: "Requested time conflicts with another booking" };
  }

  return { ok: true };
}

export function isRescheduleEligible(status: string) {
  return ACCEPTED_STATUSES.includes(status as (typeof ACCEPTED_STATUSES)[number]);
}
