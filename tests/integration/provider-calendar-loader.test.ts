import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { loadProviderCalendar } from "@/lib/provider-calendar";

vi.mock("@/lib/db", () => {
  return {
    db: {
      query: {
        bookings: { findMany: vi.fn() },
        providerTimeOffs: { findMany: vi.fn() },
      },
    },
  };
});

const mockedDb = (await import("@/lib/db")).db;

describe("loadProviderCalendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges bookings and time off with start/end dates", async () => {
    const bookingDate = new Date("2024-02-10T10:00:00Z");
    const timeOffStart = new Date("2024-02-15T09:00:00Z");
    const timeOffEnd = new Date("2024-02-16T17:00:00Z");

    (mockedDb.query.bookings.findMany as unknown as Mock).mockResolvedValue([
      { id: "b1", status: "accepted", scheduledDate: bookingDate },
    ]);
    (mockedDb.query.providerTimeOffs.findMany as unknown as Mock).mockResolvedValue([
      { id: "t1", startTime: timeOffStart, endTime: timeOffEnd, reason: "Vacation" },
    ]);

    const result = await loadProviderCalendar({ providerId: "p1", rangeStart: new Date("2024-02-01"), rangeEnd: new Date("2024-02-28") });

    expect(result.bookings).toHaveLength(1);
    expect(result.timeOffs).toHaveLength(1);
    expect(result.bookings[0].start).toEqual(bookingDate);
    expect(result.bookings[0].end).toEqual(bookingDate);
    expect(result.timeOffs[0].start).toEqual(timeOffStart);
    expect(result.timeOffs[0].end).toEqual(timeOffEnd);
  });
});
