'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  addMonths,
  addWeeks,
  differenceInMinutes,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isWithinInterval,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { DateRange } from "react-day-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
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
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Loader2, PlusCircle, Trash2 } from "lucide-react";
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

const statusPillClasses: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-800 dark:text-yellow-200",
  accepted: "bg-blue-500/15 text-blue-800 dark:text-blue-200",
  paid: "bg-green-500/15 text-green-800 dark:text-green-200",
  completed: "bg-muted text-foreground",
  time_off: "bg-destructive/10 text-destructive",
};

function getEventLabel(event: CalendarEvent) {
  if (event.type === "time_off") return "Time off";
  return getBookingStatusLabel(event.status);
}

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

export function ProviderCalendarClient({ initialEvents, initialTimeOffs }: { initialEvents: CalendarEvent[]; initialTimeOffs: CalendarEvent[] }) {
  const [view, setView] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents.map(normalizeEvent));
  const [timeOffs, setTimeOffs] = useState<CalendarEvent[]>(initialTimeOffs.map(normalizeEvent));
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: new Date(), to: new Date() });
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isRangeLoading, setIsRangeLoading] = useState(false);

  const monthLabel = format(cursor, "MMMM yyyy");
  const weekStart = startOfWeek(cursor);
  const weekEnd = endOfWeek(cursor);
  const rangeStart = view === "month" ? startOfMonth(cursor) : weekStart;
  const rangeEnd = view === "month" ? endOfMonth(cursor) : weekEnd;
  const headerLabel = view === "month" ? monthLabel : `Week of ${format(weekStart, "dd MMM yyyy")}`;

  const weeks = useMemo(() => buildCalendarGrid(cursor), [cursor]);
  const allEvents = useMemo(() => [...events, ...timeOffs], [events, timeOffs]);

  const dayEvents = useMemo(() => allEvents.filter((e) => isOnDay(e, selectedDate)), [allEvents, selectedDate]);

  const fetchRange = useCallback(async () => {
    try {
      setIsRangeLoading(true);
      const start = startOfDay(rangeStart).toISOString();
      const end = endOfDay(rangeEnd).toISOString();
      const res = await fetch(`/api/provider/calendar?start=${start}&end=${end}`);
      if (!res.ok) return;
      const data = (await res.json()) as CalendarApiResponse;
      setEvents((data.bookings ?? []).map(normalizeEvent));
      setTimeOffs((data.timeOffs ?? []).map(normalizeEvent));
    } finally {
      setIsRangeLoading(false);
    }
  }, [rangeEnd, rangeStart]);

  useEffect(() => {
    void fetchRange();
  }, [fetchRange]);

  useEffect(() => {
    if (!isWithinInterval(selectedDate, { start: startOfDay(rangeStart), end: endOfDay(rangeEnd) })) {
      setSelectedDate(rangeStart);
    }
  }, [rangeEnd, rangeStart, selectedDate]);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              setCursor(view === "month" ? addMonths(cursor, -1) : addWeeks(cursor, -1))
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> {headerLabel}
            {isRangeLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              setCursor(view === "month" ? addMonths(cursor, 1) : addWeeks(cursor, 1))
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as "month" | "week")}>
            <TabsList>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
            </TabsList>
          </Tabs>
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
          {view === "month" ? (
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
                      const maxBadges = 2;
                      return (
                        <button
                          key={day.date.toISOString()}
                          onClick={() => setSelectedDate(day.date)}
                          title={hasTimeOff ? "Time off (you are unavailable)" : undefined}
                          className={cn(
                            "min-h-[68px] md:min-h-[92px] rounded border p-1 text-left transition",
                            day.inCurrentMonth ? "bg-background" : "bg-muted/30",
                            isSelected && "ring-2 ring-primary",
                            hasTimeOff && "border-destructive/30 bg-destructive/5",
                          )}
                        >
                          <div className="flex justify-between text-xs">
                            <span className={day.inCurrentMonth ? "text-foreground" : "text-muted-foreground"}>
                              {format(day.date, "d")}
                            </span>
                            {dayEventsForDate.length > 0 && (
                              <Badge variant="secondary" className="text-[10px] px-1.5">
                                {dayEventsForDate.length}
                              </Badge>
                            )}
                          </div>
                          {/* Mobile: compact dots (avoid unreadable truncated pills) */}
                          <div className="mt-2 flex flex-wrap items-center gap-1 sm:hidden">
                            {dayEventsForDate.slice(0, 4).map((event) => (
                              <span
                                key={`${event.type}-${event.id}`}
                                className={cn("h-2 w-2 rounded-full", getEventDotClass(event))}
                                aria-label={
                                  event.type === "time_off"
                                    ? "Time off"
                                    : getBookingStatusLabel(event.status)
                                }
                                title={
                                  event.type === "time_off"
                                    ? event.title
                                      ? `Time off • ${event.title}`
                                      : "Time off"
                                    : `${getBookingStatusLabel(event.status)} • ${event.title}`
                                }
                              />
                            ))}
                            {dayEventsForDate.length > 4 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{dayEventsForDate.length - 4}
                              </span>
                            )}
                          </div>

                          {/* Desktop/tablet: show readable pills */}
                          <div className="mt-1 hidden space-y-1 sm:block">
                            {dayEventsForDate.slice(0, maxBadges).map((event) => (
                              <div
                                key={`${event.type}-${event.id}`}
                                title={
                                  event.type === "time_off"
                                    ? event.title
                                      ? `Time off • ${event.title}`
                                      : "Time off"
                                    : `${getBookingStatusLabel(event.status)} • ${event.title}`
                                }
                                className={cn(
                                  "flex items-center gap-1 text-[11px] rounded px-1 py-0.5",
                                  statusPillClasses[event.status] ?? "bg-secondary text-secondary-foreground",
                                )}
                              >
                                <span className={cn("h-1.5 w-1.5 rounded-full", getEventDotClass(event))} />
                                <span className="truncate">
                                  {event.type === "time_off" ? "Time off" : event.title || getEventLabel(event)}
                                </span>
                              </div>
                            ))}
                            {dayEventsForDate.length > maxBadges && (
                              <div className="text-[10px] text-muted-foreground">
                                +{dayEventsForDate.length - maxBadges} more
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[720px] space-y-2">
                <div className="grid grid-cols-7 gap-2 text-xs font-medium text-muted-foreground">
                  {Array.from({ length: 7 }).map((_, i) => {
                    const date = new Date(weekStart);
                    date.setDate(weekStart.getDate() + i);
                    const label = format(date, "EEE d");
                    return (
                      <div key={label} className="text-center">
                        {label}
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {Array.from({ length: 7 }).map((_, i) => {
                    const date = new Date(weekStart);
                    date.setDate(weekStart.getDate() + i);
                    const dayEventsForDate = allEvents.filter((e) => isOnDay(e, date));
                    const hasTimeOff = timeOffs.some((t) => isOnDay(t, date));
                    const isSelected = isSameDay(date, selectedDate);
                    const maxBadges = 4;
                    return (
                      <button
                        key={date.toISOString()}
                        onClick={() => setSelectedDate(date)}
                        title={hasTimeOff ? "Time off (you are unavailable)" : undefined}
                        className={cn(
                          "min-h-[120px] rounded border p-2 text-left transition",
                          "bg-background",
                          isSelected && "ring-2 ring-primary",
                          hasTimeOff && "border-destructive/30 bg-destructive/5",
                        )}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground">{format(date, "d")}</span>
                          {dayEventsForDate.length > 0 && (
                            <Badge variant="secondary" className="text-[10px]">
                              {dayEventsForDate.length}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-2 space-y-1">
                          {dayEventsForDate.slice(0, maxBadges).map((event) => (
                            <div
                              key={`${event.type}-${event.id}`}
                              title={
                                event.type === "time_off"
                                  ? event.title
                                    ? `Time off • ${event.title}`
                                    : "Time off"
                                  : `${getBookingStatusLabel(event.status)} • ${event.title}`
                              }
                              className={cn(
                                "flex items-center gap-1 text-[11px] rounded px-1 py-0.5",
                                statusPillClasses[event.status] ?? "bg-secondary text-secondary-foreground",
                              )}
                            >
                              <span className={cn("h-1.5 w-1.5 rounded-full", getEventDotClass(event))} />
                              <span className="truncate">
                                {event.type === "time_off" ? "Time off" : event.title || getEventLabel(event)}
                              </span>
                            </div>
                          ))}
                          {dayEventsForDate.length > maxBadges && (
                            <div className="text-[10px] text-muted-foreground">
                              +{dayEventsForDate.length - maxBadges} more
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
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
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Day details</CardTitle>
            <CardDescription>{format(selectedDate, "EEEE, dd MMM yyyy")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {dayEvents.length === 0 && <p className="text-sm text-muted-foreground">No events.</p>}
            {dayEvents.map((event) => {
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
                          <AlertDialogAction onClick={() => deleteTimeOff(event.id)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
