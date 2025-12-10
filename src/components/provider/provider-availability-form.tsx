"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";

type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

type AvailabilityRow = {
  dayOfWeek: DayOfWeek;
  label: string;
  startTime: string;
  endTime: string;
  isEnabled: boolean;
};

const DAYS: AvailabilityRow["dayOfWeek"][] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

type ApiAvailability = {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  isEnabled: boolean;
};

function normaliseTimeInput(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  // Expect values like HH:MM or HH:MM:SS – keep hour + minutes.
  if (value.length >= 5) return value.slice(0, 5);
  return fallback;
}

function toApiTime(value: string): string {
  // Convert HH:MM -> HH:MM:00 for the SQL time column.
  if (!value) return "00:00:00";
  if (value.length === 5) return `${value}:00`;
  return value;
}

export function ProviderAvailabilityForm() {
  const { toast } = useToast();

  const [rows, setRows] = useState<AvailabilityRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSchedule() {
      try {
        setIsLoading(true);
        setError(null);

        const res = await fetch("/api/provider/availability/schedule");
        if (!res.ok) {
          throw new Error(await res.text());
        }

        const data = (await res.json()) as ApiAvailability[];

        if (cancelled) return;

        const byDay = new Map<DayOfWeek, ApiAvailability>();
        for (const entry of data) {
          byDay.set(entry.dayOfWeek, entry);
        }

        const nextRows: AvailabilityRow[] = DAYS.map((day) => {
          const existing = byDay.get(day);
          return {
            dayOfWeek: day,
            label: DAY_LABELS[day],
            startTime: normaliseTimeInput(existing?.startTime, "09:00"),
            endTime: normaliseTimeInput(existing?.endTime, "17:00"),
            isEnabled: existing?.isEnabled ?? false,
          };
        });

        setRows(nextRows);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load availability.";
        if (!cancelled) {
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSchedule();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChangeTime = (day: DayOfWeek, field: "startTime" | "endTime", value: string) => {
    setRows((prev) => {
      if (!prev) return prev;
      return prev.map((row) => (row.dayOfWeek === day ? { ...row, [field]: value } : row));
    });
  };

  const handleToggle = (day: DayOfWeek, isEnabled: boolean) => {
    setRows((prev) => {
      if (!prev) return prev;
      return prev.map((row) => (row.dayOfWeek === day ? { ...row, isEnabled } : row));
    });
  };

  const handleSave = async () => {
    if (!rows) return;

    const invalid = rows.filter((row) => {
      if (!row.isEnabled) return false;
      return row.startTime >= row.endTime;
    });

    if (invalid.length > 0) {
      setError("Please ensure end time is after start time for all available days.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const payload: ApiAvailability[] = rows.map((row) => ({
        dayOfWeek: row.dayOfWeek,
        startTime: toApiTime(row.startTime),
        endTime: toApiTime(row.endTime),
        isEnabled: row.isEnabled,
      }));

      const res = await fetch("/api/provider/availability/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      toast({ title: "Availability updated" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save availability.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Weekly schedule</CardTitle>
          <CardDescription>Set the days and hours you&apos;re available for bookings.</CardDescription>
        </div>
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2 sm:mt-0">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading schedule...
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 p-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3 w-3" />
            <p>{error}</p>
          </div>
        )}

        {rows === null || isLoading ? (
          <div className="space-y-2">
            {DAYS.map((day) => (
              <div key={day} className="flex items-center justify-between gap-4">
                <div className="w-10 text-xs font-medium text-muted-foreground">{DAY_LABELS[day]}</div>
                <Skeleton className="h-8 flex-1" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.dayOfWeek} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-10 text-xs font-medium text-muted-foreground">{row.label}</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Off</span>
                    <Switch
                      checked={row.isEnabled}
                      onCheckedChange={(checked) => handleToggle(row.dayOfWeek, Boolean(checked))}
                      aria-label={`${row.label} availability`}
                    />
                    <span className="text-muted-foreground">On</span>
                  </div>
                </div>
                <div className="flex flex-1 items-center gap-2 sm:justify-end">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>From</span>
                    <Input
                      type="time"
                      className="h-8 w-24"
                      value={row.startTime}
                      onChange={(e) => handleChangeTime(row.dayOfWeek, "startTime", e.target.value)}
                      disabled={!row.isEnabled}
                    />
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>to</span>
                    <Input
                      type="time"
                      className="h-8 w-24"
                      value={row.endTime}
                      onChange={(e) => handleChangeTime(row.dayOfWeek, "endTime", e.target.value)}
                      disabled={!row.isEnabled}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={isSaving || rows === null}>
            {isSaving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </span>
            ) : (
              "Save schedule"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
