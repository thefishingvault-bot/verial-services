import { addDays, endOfMonth, endOfWeek, isSameMonth, startOfMonth, startOfWeek } from "date-fns";

export type CalendarEvent =
  | {
      id: string;
      type: "booking";
      status: string;
      start: Date;
      end: Date;
      title: string;
    }
  | {
      id: string;
      type: "time_off";
      status: "time_off";
      start: Date;
      end: Date;
      title: string;
    };

export type CalendarDay = {
  date: Date;
  inCurrentMonth: boolean;
};

// Pure helper used by both server and client code
export function buildCalendarGrid(month: Date): CalendarDay[][] {
  const start = startOfWeek(startOfMonth(month));
  const end = endOfWeek(endOfMonth(month));

  const days: CalendarDay[] = [];
  let cursor = start;
  while (cursor <= end) {
    days.push({ date: cursor, inCurrentMonth: isSameMonth(cursor, month) });
    cursor = addDays(cursor, 1);
  }

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}
