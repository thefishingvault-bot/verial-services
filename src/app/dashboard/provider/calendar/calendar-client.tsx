'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  addMonths,
  differenceInMinutes,
  endOfDay,
  endOfMonth,
  format,
  isWithinInterval,
  startOfDay,
  startOfMonth,
} from "date-fns";
import type { DateRange } from "react-day-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, KeyRound, Loader2, PlusCircle, Trash2 } from "lucide-react";
import { buildCalendarGrid, type CalendarEvent } from "@/lib/provider-calendar-shared";
import { cn } from "@/lib/utils";
import { getBookingStatusLabel, getBookingStatusVariant } from "@/lib/bookings/status";

type BookingEvent = Extract<CalendarEvent, { type: "booking" }>;
type TimeOffEvent = Extract<CalendarEvent, { type: "time_off" }>;
type ApiEvent = (Omit<BookingEvent, "start" | "end"> | Omit<TimeOffEvent, "start" | "end">) & {
  start: string | Date;
  end: string | Date;
};
type CalendarApiResponse = { bookings?: ApiEvent[]; timeOffs?: ApiEvent[] };

function getEventDotClass(event: CalendarEvent) {
  if (event.type === "time_off") return "bg-destructive";
  switch (event.status) {
    case "pending":
      return "bg-yellow-500";
    case "accepted":
      return "bg-blue-500";
    case "paid":
      return "bg-green-500";
    default:
      return "bg-muted-foreground";
  }
}

function normalizeEvent(event: ApiEvent | CalendarEvent): CalendarEvent {
  const startValue = (event as ApiEvent).start ?? (event as ApiEvent).end;
  const endValue = (event as ApiEvent).end ?? (event as ApiEvent).start;
  const safeStart = startValue ?? new Date();
  const safeEnd = endValue ?? startValue ?? new Date();
  const start = new Date(safeStart);
  const end = new Date(safeEnd);

  if (event.type === "time_off") {
    return {
      id: event.id,
      type: "time_off",
      status: "time_off",
      title: event.title,
      start,
      end,
    };
  }

  return {
    id: event.id,
    type: "booking",
    status: event.status,
    title: event.title,
    start,
    end,
  };
}

function isOnDay(event: CalendarEvent, day: Date) {
  const start = startOfDay(event.start);
  const end = endOfDay(event.end ?? event.start);
  return isWithinInterval(day, { start, end });
}

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

function getEventPriority(event: CalendarEvent) {
  if (event.type === "time_off") return 0;
  switch (event.status) {
    case "pending":
      return 1;
    case "accepted":
      return 2;
    case "paid":
      return 3;
    case "completed":
      return 4;
    default:
      return 5;
  }
}

function buildDaySummary(events: CalendarEvent[]) {
  if (events.length === 0) return "No events";

  const counts = {
    pending: 0,
    accepted: 0,
    paid: 0,
    completed: 0,
    time_off: 0,
    other: 0,
  };

  for (const event of events) {
    if (event.type === "time_off") {
      counts.time_off += 1;
      continue;
    }
    switch (event.status) {
      case "pending":
        counts.pending += 1;
        break;
      case "accepted":
        counts.accepted += 1;
        break;
      case "paid":
        counts.paid += 1;
        break;
      case "completed":
        counts.completed += 1;
        break;
      default:
        counts.other += 1;
        break;
    }
  }

  const parts: string[] = [];
  if (counts.pending) parts.push(`${counts.pending} pending`);
  if (counts.accepted) parts.push(`${counts.accepted} accepted`);
  if (counts.paid) parts.push(`${counts.paid} paid`);
  if (counts.completed) parts.push(`${counts.completed} completed`);
  if (counts.time_off) parts.push(`${counts.time_off} time off`);
  if (counts.other) parts.push(`${counts.other} other`);

  return `${events.length} event${events.length === 1 ? "" : "s"}: ${parts.join(", ")}`;
}

function DayIndicators({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) return null;

  const sorted = [...events].sort((a, b) => {
    const priority = getEventPriority(a) - getEventPriority(b);
    if (priority !== 0) return priority;
    return a.start.getTime() - b.start.getTime();
  });

  const visibleDots = sorted.slice(0, 3);
  const remaining = Math.max(0, sorted.length - visibleDots.length);

  return (
    <>
      <span className="sr-only">{buildDaySummary(events)}</span>

      <span
        aria-hidden="true"
        className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1 text-[10px] font-medium leading-none text-secondary-foreground"
      >
        {events.length}
      </span>

      <span aria-hidden="true" className="absolute bottom-2 left-2 flex items-center gap-1">
        {visibleDots.map((event) => (
          <span
            key={`${event.type}-${event.id}`}
            className={cn("h-2 w-2 rounded-full", getEventDotClass(event))}
            title={
              event.type === "time_off"
                ? event.title
                  ? `Time off • ${event.title}`
                  : "Time off"
                : `${getBookingStatusLabel(event.status)} • ${event.title}`
            }
          />
        ))}
        {remaining > 0 && (
          <span className="text-[10px] font-medium leading-none text-muted-foreground">+{remaining}</span>
        )}
      </span>
    </>
  );
}

function DayDetailsContent({ events, onDeleteTimeOff }: { events: CalendarEvent[]; onDeleteTimeOff: (id: string) => void }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No events.</p>;
  }

  return (
    <div className="space-y-3">
      {events.map((event) => {
        const startLabel = event.start ? format(event.start, "HH:mm") : null;
        const endLabel = event.end ? format(event.end, "HH:mm") : null;
        const timeLabel = (() => {
          if (event.type === "time_off") {
            if (startLabel && endLabel) return `${startLabel}–${endLabel}`;
            if (startLabel) return startLabel;
            return null;
          }
          if (startLabel && endLabel && startLabel !== endLabel) return `${startLabel}–${endLabel}`;
          return startLabel;
        })();

        return (
          <div key={`${event.id}-${event.type}`} className="flex items-start justify-between gap-3 rounded border p-3">
            <div className="min-w-0 space-y-1">
              {event.type === "time_off" ? (
                <Badge variant="destructive">Time off</Badge>
              ) : (
                <Badge variant={getBookingStatusVariant(event.status)}>{getBookingStatusLabel(event.status)}</Badge>
              )}
              <div className="text-sm font-medium flex items-center gap-2">
                <span className="truncate">{event.type === "time_off" ? event.title || "Time off" : event.title || "Booking"}</span>
                {event.type === "booking" && <Clock className="h-3 w-3 text-muted-foreground" />}
              </div>
              <div className="text-xs text-muted-foreground">
                {timeLabel ? timeLabel : null}
                {event.type === "time_off" && event.title ? ` • ${event.title}` : null}
              </div>
            </div>

            {event.type === "booking" ? (
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link href={`/dashboard/provider/bookings/${event.id}`}>View</Link>
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="shrink-0" title="Delete time off">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete time off?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove the block from your calendar.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDeleteTimeOff(event.id)}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ProviderCalendarClient({ initialEvents, initialTimeOffs }: { initialEvents: CalendarEvent[]; initialTimeOffs: CalendarEvent[] }) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const [cursor, setCursor] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents.map(normalizeEvent));
  const [timeOffs, setTimeOffs] = useState<CalendarEvent[]>(initialTimeOffs.map(normalizeEvent));
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dayDetailsOpen, setDayDetailsOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: new Date(), to: new Date() });
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isRangeLoading, setIsRangeLoading] = useState(false);

  // NOTE: startOfMonth/startOfWeek etc return new Date objects each call.
  // Memoize them so effects don't re-trigger on every render.
  const range = useMemo(() => {
    const rangeStart = startOfMonth(cursor);
    const rangeEnd = endOfMonth(cursor);
    const headerLabel = format(cursor, "MMMM yyyy");

    return { rangeStart, rangeEnd, headerLabel };
  }, [cursor]);

  const weeks = useMemo(() => buildCalendarGrid(cursor), [cursor]);
  const allEvents = useMemo(() => [...events, ...timeOffs], [events, timeOffs]);

  const dayEvents = useMemo(() => allEvents.filter((e) => isOnDay(e, selectedDate)), [allEvents, selectedDate]);

  const fetchRange = useCallback(async () => {
    try {
      setIsRangeLoading(true);
      const start = startOfDay(range.rangeStart).toISOString();
      const end = endOfDay(range.rangeEnd).toISOString();
      const res = await fetch(`/api/provider/calendar?start=${start}&end=${end}`);
      if (!res.ok) return;
      const data = (await res.json()) as CalendarApiResponse;
      setEvents((data.bookings ?? []).map(normalizeEvent));
      setTimeOffs((data.timeOffs ?? []).map(normalizeEvent));
    } finally {
      setIsRangeLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void fetchRange();
  }, [fetchRange]);

  useEffect(() => {
    if (!isWithinInterval(selectedDate, { start: startOfDay(range.rangeStart), end: endOfDay(range.rangeEnd) })) {
      setSelectedDate(range.rangeStart);
    }
  }, [range, selectedDate]);

  const createTimeOff = async () => {
    if (!dateRange?.from) {
      setError("Select at least one date for time off");
      return;
    }

    const from = dateRange.from;
    const to = dateRange.to ?? dateRange.from;

    const startIso = new Date(`${format(from, "yyyy-MM-dd")}T${startTime}:00`).toISOString();
    const endIso = new Date(`${format(to, "yyyy-MM-dd")}T${endTime}:00`).toISOString();

    if (new Date(startIso) >= new Date(endIso)) {
      setError("End time must be after start time.");
      return;
    }

    const optimisticId = `temp-${Date.now()}`;
    const optimistic: CalendarEvent = {
      id: optimisticId,
      type: "time_off",
      status: "time_off",
      start: new Date(startIso),
      end: new Date(endIso),
      title: reason || "Time off",
    };

    setLoading(true);
    setError(null);
    setTimeOffs((prev) => [...prev, optimistic]);

    try {
      const res = await fetch("/api/provider/time-off/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: startIso, endTime: endIso, reason }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to create time off");
      }

      const created = (await res.json()) as { id: string; startTime?: string; endTime?: string; reason?: string; start?: string; end?: string };
      const normalized = normalizeEvent({
        id: created.id,
        type: "time_off",
        status: "time_off",
        start: created.start ?? created.startTime ?? startIso,
        end: created.end ?? created.endTime ?? endIso,
        title: (created.reason ?? reason) || "Time off",
      });

      setTimeOffs((prev) => [...prev.filter((t) => t.id !== optimisticId), normalized]);
      setDialogOpen(false);
      setReason("");
      setDateRange({ from, to });
      void fetchRange();
    } catch (err) {
      setTimeOffs((prev) => prev.filter((t) => t.id !== optimisticId));
      setError(err instanceof Error ? err.message : "Failed to create time off");
    } finally {
      setLoading(false);
    }
  };

  const deleteTimeOff = async (id: string) => {
    setLoading(true);
    setError(null);
    const previous = timeOffs;
    setTimeOffs((prev) => prev.filter((t) => t.id !== id));
    try {
      const res = await fetch(`/api/provider/time-off/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to delete time off");
      }
      void fetchRange();
    } catch (err) {
      setTimeOffs(previous);
      setError(err instanceof Error ? err.message : "Failed to delete time off");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isDesktop && dayDetailsOpen) {
      setDayDetailsOpen(false);
    }
  }, [isDesktop, dayDetailsOpen]);

  useEffect(() => {
    if (isDesktop && legendOpen) {
      setLegendOpen(false);
    }
  }, [isDesktop, legendOpen]);

  const handleSelectDay = (day: Date) => {
    setSelectedDate(day);
    if (!isDesktop) {
      setDayDetailsOpen(true);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor(addMonths(cursor, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> {range.headerLabel}
            {isRangeLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor(addMonths(cursor, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Time Off
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Block time off</DialogTitle>
                <DialogDescription>Select dates and optional times to block yourself out.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={1} />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Start time</label>
                    <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">End time</label>
                    <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Reason (optional)</label>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Vacation, holiday, etc." />
                </div>
                {dateRange?.from && (
                  <p className="text-xs text-muted-foreground">
                    {(() => {
                      const from = dateRange.from!;
                      const to = dateRange.to ?? dateRange.from!;
                      const start = new Date(`${format(from, "yyyy-MM-dd")}T${startTime}:00`);
                      const end = new Date(`${format(to, "yyyy-MM-dd")}T${endTime}:00`);
                      if (end <= start) return null;
                      const minutes = differenceInMinutes(end, start);
                      const hours = minutes / 60;
                      if (!Number.isFinite(hours) || hours <= 0) return null;
                      if (Number.isInteger(hours)) return `Duration: ${hours} hour${hours === 1 ? "" : "s"}`;
                      return `Duration: ${hours.toFixed(1)} hours`;
                    })()}
                  </p>
                )}
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={createTimeOff} disabled={loading}>
                  {loading ? "Saving..." : "Save time off"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-3">
          <>
            <div className="grid grid-cols-7 gap-2 text-xs font-medium text-muted-foreground">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="text-center">
                  {d}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {weeks.map((week, idx) => (
                <div key={idx} className="grid grid-cols-7 gap-2">
                  {week.map((day) => {
                    const dayEventsForDate = allEvents.filter((e) => isOnDay(e, day.date));
                    const hasTimeOff = timeOffs.some((t) => isOnDay(t, day.date));
                    const isSelected = isSameDay(day.date, selectedDate);
                    const isToday = isSameDay(day.date, new Date());

                    return (
                      <button
                        key={day.date.toISOString()}
                        onClick={() => handleSelectDay(day.date)}
                        title={hasTimeOff ? "Time off (you are unavailable)" : undefined}
                        aria-label={`${format(day.date, "EEEE, MMM d")}. ${buildDaySummary(dayEventsForDate)}`}
                        className={cn(
                          "relative min-h-16 sm:min-h-23 rounded-md border p-2 text-left transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          day.inCurrentMonth ? "bg-background" : "bg-muted/30",
                          isToday && !isSelected && "border-primary/40 bg-primary/5",
                          isSelected && "ring-2 ring-primary bg-primary/5",
                          hasTimeOff && "border-destructive/30 bg-destructive/5",
                        )}
                      >
                        <div className="text-xs font-medium">
                          <span className={day.inCurrentMonth ? "text-foreground" : "text-muted-foreground"}>
                            {format(day.date, "d")}
                          </span>
                        </div>

                        <DayIndicators events={dayEventsForDate} />
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </>

          {/* Desktop legend */}
          <div className="hidden lg:flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-yellow-500" /> Pending
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-500" /> Accepted
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-green-500" /> Paid
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-muted-foreground" /> Completed
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-3 rounded-sm bg-destructive/20 border border-destructive/30" /> Time off
            </span>
          </div>

          {/* Mobile legend: compact Key control */}
          <div className="lg:hidden">
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setLegendOpen(true)}>
              <KeyRound className="mr-2 h-4 w-4" /> Key
            </Button>
          </div>
        </div>

        {/* Desktop: persistent side panel */}
        <Card className="hidden lg:block">
          <CardHeader>
            <CardTitle>Day details</CardTitle>
            <CardDescription>{format(selectedDate, "EEEE, dd MMM yyyy")}</CardDescription>
          </CardHeader>
          <CardContent>
            <DayDetailsContent events={dayEvents} onDeleteTimeOff={deleteTimeOff} />
          </CardContent>
        </Card>

        {/* Mobile: bottom sheet opened by tapping a day */}
        <Sheet open={dayDetailsOpen} onOpenChange={setDayDetailsOpen}>
          <SheetContent side="bottom" className="lg:hidden rounded-t-lg pb-[env(safe-area-inset-bottom)]">
            <SheetHeader>
              <SheetTitle>Day details</SheetTitle>
              <SheetDescription>{format(selectedDate, "EEEE, dd MMM yyyy")}</SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-4 overflow-y-auto">
              <DayDetailsContent events={dayEvents} onDeleteTimeOff={deleteTimeOff} />
            </div>
          </SheetContent>
        </Sheet>

        <Sheet open={legendOpen} onOpenChange={setLegendOpen}>
          <SheetContent side="bottom" className="lg:hidden rounded-t-lg pb-[env(safe-area-inset-bottom)]">
            <SheetHeader>
              <SheetTitle>Key</SheetTitle>
              <SheetDescription>Statuses shown on the calendar.</SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
                  <span>Pending</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                  <span>Accepted</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                  <span>Paid</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground" />
                  <span>Completed</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-3 rounded-sm bg-destructive/20 border border-destructive/30" />
                  <span>Time off</span>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
