import { describe, expect, it } from "vitest";
import { buildCalendarGrid, type CalendarDay } from "@/lib/provider-calendar-shared";
import { startOfMonth } from "date-fns";

describe("buildCalendarGrid", () => {
  it("returns weeks covering the whole month with leading/trailing days", () => {
    const month = new Date("2024-02-15T00:00:00Z");
    const weeks = buildCalendarGrid(month);

    expect(weeks.length === 4 || weeks.length === 5 || weeks.length === 6).toBe(true);
    const flat = weeks.flat();
    expect(flat.length % 7).toBe(0);
    expect(flat[0].date.getDay()).toBe(0); // starts on Sunday
  });

  it("marks days belonging to current month", () => {
    const month = startOfMonth(new Date("2024-02-01T00:00:00Z"));
    const weeks = buildCalendarGrid(month);
    const inMonth = weeks.flat().filter((d: CalendarDay) => d.inCurrentMonth);
    expect(inMonth[0].date.getMonth()).toBe(month.getMonth());
  });
});
