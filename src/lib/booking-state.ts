import { bookingStatusEnum } from "@/db/schema";

export type BookingStatus = (typeof bookingStatusEnum.enumValues)[number];

const LEGACY_STATUS_MAP: Record<string, BookingStatus> = {
  confirmed: "accepted",
  canceled: "canceled_customer",
};

export function normalizeStatus(status: string): BookingStatus {
  if (status in LEGACY_STATUS_MAP) {
    return LEGACY_STATUS_MAP[status];
  }

  if ((bookingStatusEnum.enumValues as readonly string[]).includes(status)) {
    return status as BookingStatus;
  }

  throw new Error(`Unknown booking status: ${status}`);
}

// Allowed state transitions for the booking lifecycle.
const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ["accepted", "declined", "canceled_customer"],
  accepted: ["paid", "canceled_provider", "canceled_customer"],
  declined: [],
  paid: ["completed", "disputed", "refunded"],
  completed: [],
  canceled_customer: [],
  canceled_provider: [],
  disputed: ["refunded"],
  refunded: [],
};

export function canTransition(current: string, next: BookingStatus): boolean {
  const normalizedCurrent = normalizeStatus(current);
  const allowed = ALLOWED_TRANSITIONS[normalizedCurrent] ?? [];
  return allowed.includes(next);
}

export function assertTransition(current: string, next: BookingStatus) {
  const normalizedCurrent = normalizeStatus(current);
  if (!canTransition(normalizedCurrent, next)) {
    const allowed = ALLOWED_TRANSITIONS[normalizedCurrent] ?? [];
    throw new Error(
      `Invalid booking status transition from '${normalizedCurrent}' to '${next}'. Allowed: ${allowed.join(", ") || "(none)"}`,
    );
  }
}

export function getAllowedTransitions(current: string): BookingStatus[] {
  const normalizedCurrent = normalizeStatus(current);
  return [...(ALLOWED_TRANSITIONS[normalizedCurrent] ?? [])];
}
