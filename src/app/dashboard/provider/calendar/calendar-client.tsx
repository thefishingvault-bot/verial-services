'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { addMonths, differenceInMinutes, endOfDay, format, isWithinInterval, startOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Loader2, PlusCircle, Trash2 } from "lucide-react";
import { buildCalendarGrid, type CalendarEvent } from "@/lib/provider-calendar";

type BookingEvent = Extract<CalendarEvent, { type: "booking" }>;
type TimeOffEvent = Extract<CalendarEvent, { type: "time_off" }>;
type ApiEvent = (Omit<BookingEvent, "start" | "end"> | Omit<TimeOffEvent, "start" | "end">) & {
  start: string | Date;
  end: string | Date;
};
type CalendarApiResponse = { bookings?: ApiEvent[]; timeOffs?: ApiEvent[] };

const statusColors: Record<string, string> = {
  pending: "bg-yellow-200 text-yellow-900",
  accepted: "bg-blue-200 text-blue-900",
  paid: "bg-green-200 text-green-900",
  completed: "bg-gray-200 text-gray-900",
  time_off: "bg-red-200 text-red-900",
};

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

  const weeks = useMemo(() => buildCalendarGrid(cursor), [cursor]);
  const allEvents = useMemo(() => [...events, ...timeOffs], [events, timeOffs]);

  const dayEvents = useMemo(() => allEvents.filter((e) => isOnDay(e, selectedDate)), [allEvents, selectedDate]);

  const fetchRange = useCallback(async () => {
    try {
      setIsRangeLoading(true);
      const start = startOfDay(new Date(cursor.getFullYear(), cursor.getMonth(), 1)).toISOString();
      const end = endOfDay(addMonths(cursor, 1)).toISOString();
      const res = await fetch(`/api/provider/calendar?start=${start}&end=${end}`);
      if (!res.ok) return;
      const data = (await res.json()) as CalendarApiResponse;
      setEvents((data.bookings ?? []).map(normalizeEvent));
      setTimeOffs((data.timeOffs ?? []).map(normalizeEvent));
    } finally {
      setIsRangeLoading(false);
    }
  }, [cursor]);

  useEffect(() => {
    void fetchRange();
  }, [fetchRange]);

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
    if (!window.confirm("Delete this time-off block?")) return;
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
          <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> {monthLabel}
            {isRangeLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}>
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
                  title={hasTimeOff ? "Time Off (Provider Unavailable)" : undefined}
                  className={`min-h-[92px] rounded border p-1 text-left transition ${day.inCurrentMonth ? "bg-white" : "bg-muted/50"} ${isSelected ? "ring-2 ring-primary" : ""} ${
                    hasTimeOff ? "border-red-200 bg-red-50" : ""
                  }`}
                >
                  <div className="flex justify-between text-xs">
                    <span className={day.inCurrentMonth ? "text-foreground" : "text-muted-foreground"}>{format(day.date, "d")}</span>
                    {dayEventsForDate.length > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        {dayEventsForDate.length}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 space-y-1">
                    {dayEventsForDate.slice(0, maxBadges).map((event) => (
                      <div
                        key={event.id}
                        title={event.type === "time_off" ? "Time Off (Provider Unavailable)" : event.status}
                        className={`flex items-center gap-1 text-[11px] rounded px-1 py-0.5 ${statusColors[event.status] ?? "bg-slate-200"}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            event.type === "time_off"
                              ? "bg-red-500"
                              : event.status === "pending"
                              ? "bg-yellow-500"
                              : event.status === "accepted"
                              ? "bg-blue-500"
                              : event.status === "paid"
                              ? "bg-green-500"
                              : "bg-gray-400"
                          }`}
                        />
                        <span>{event.type === "time_off" ? "Time off" : event.status}</span>
                      </div>
                    ))}
                    {dayEventsForDate.length > maxBadges && (
                      <div className="text-[10px] text-muted-foreground">+{dayEventsForDate.length - maxBadges} more</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-yellow-500" /> Pending
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-blue-500" /> Confirmed
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-green-500" /> Paid
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-gray-400" /> Completed
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm bg-red-200" /> Time off
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Day details</CardTitle>
          <CardDescription>{format(selectedDate, "EEEE, dd MMM yyyy")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {dayEvents.length === 0 && <p className="text-sm text-muted-foreground">No events.</p>}
          {dayEvents.map((event) => (
            <div key={`${event.id}-${event.type}`} className="flex items-center justify-between rounded border p-2">
              <div className="space-y-1">
                <Badge className={statusColors[event.status] ?? "bg-slate-200"} variant="secondary">
                  {event.status}
                </Badge>
                <div className="text-sm font-medium flex items-center gap-2">
                  {event.type === "time_off" ? "Time off" : "Booking"}
                  {event.type === "booking" && <Clock className="h-3 w-3 text-muted-foreground" />}
                </div>
                <div className="text-xs text-muted-foreground">
                  {(() => {
                    const startLabel = event.start ? format(event.start, "HH:mm") : null;
                    const endLabel = event.end ? format(event.end, "HH:mm") : null;
                    if (event.type === "time_off") {
                      if (startLabel && endLabel) {
                        return `${startLabel}–${endLabel}${event.title ? ` • ${event.title}` : ""}`;
                      }
                      if (startLabel) return `${startLabel}${event.title ? ` • ${event.title}` : ""}`;
                      return event.title || null;
                    }
                    if (startLabel && endLabel && startLabel !== endLabel) {
                      return `${startLabel}–${endLabel}`;
                    }
                    if (startLabel) return startLabel;
                    return null;
                  })()}
                </div>
              </div>
              {event.type === "time_off" && (
                <Button variant="ghost" size="icon" onClick={() => deleteTimeOff(event.id)} title="Delete time off">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
