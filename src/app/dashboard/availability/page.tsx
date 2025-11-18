'use client';

import type { FormEvent } from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertTriangle, Trash2, PlusCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
} from '@/components/ui/alert-dialog';
import { Form } from '@/components/ui/form';
import { format } from 'date-fns';

const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
type DayOfWeek = typeof DAYS_OF_WEEK[number];
interface ScheduleDay {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  isEnabled: boolean;
}
type FormValues = { schedule: ScheduleDay[] };
interface TimeOff {
  id: string;
  reason: string | null;
  startTime: string;
  endTime: string;
}

function WeeklyScheduleForm() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const form = useForm<FormValues>({
    defaultValues: {
      schedule: DAYS_OF_WEEK.map((day) => ({
        dayOfWeek: day,
        startTime: '09:00',
        endTime: '17:00',
        isEnabled: day !== 'saturday' && day !== 'sunday',
      })),
    },
  });

  const { fields, update } = useFieldArray({
    control: form.control,
    name: 'schedule',
  });

  useEffect(() => {
    const fetchSchedule = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const res = await fetch('/api/provider/availability/schedule');
        if (!res.ok) {
          if (res.status === 404) {
            setIsLoading(false);
            return;
          }

          throw new Error(await res.text());
        }

        const data = (await res.json()) as ScheduleDay[];

        if (data.length > 0) {
          const newSchedule = DAYS_OF_WEEK.map((day) => {
            const found = data.find((d) => d.dayOfWeek === day);
            if (!found) {
              return {
                dayOfWeek: day,
                startTime: '09:00',
                endTime: '17:00',
                isEnabled: false,
              };
            }

            return {
              ...found,
              startTime: found.startTime.substring(0, 5),
              endTime: found.endTime.substring(0, 5),
            };
          });

          form.reset({ schedule: newSchedule });
        }

        setIsLoading(false);
      } catch (err: unknown) {
        console.error('[AVAILABILITY_FETCH_ERROR]', err);
        setError('Failed to load schedule.');
        setIsLoading(false);
      }
    };

    fetchSchedule();
  }, [form]);

  const onSubmit = async (data: FormValues) => {
    try {
      setIsSaving(true);
      setError(null);

      const res = await fetch('/api/provider/availability/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data.schedule),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      toast({
        title: 'Schedule Updated',
        description: 'Your availability has been saved.',
      });
    } catch (err: unknown) {
      console.error('[AVAILABILITY_SAVE_ERROR]', err);
      const message = err instanceof Error ? err.message : 'Failed to save schedule.';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex p-8 justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recurring Weekly Hours</CardTitle>
        <CardDescription>
          Set your standard working week. Customers can book you during these times.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="flex flex-col md:flex-row items-center gap-4 p-4 border rounded-lg"
              >
                <div className="flex items-center w-full md:w-1/3">
                  <Checkbox
                    id={`schedule.${index}.isEnabled`}
                    checked={field.isEnabled}
                    onCheckedChange={(checked) => {
                      update(index, { ...field, isEnabled: !!checked });
                    }}
                  />
                  <Label
                    htmlFor={`schedule.${index}.isEnabled`}
                    className="ml-3 text-lg font-medium capitalize"
                  >
                    {field.dayOfWeek}
                  </Label>
                </div>
                <div className="flex-1 w-full grid grid-cols-2 gap-4">
                  <Input
                    type="time"
                    {...form.register(`schedule.${index}.startTime`)}
                    disabled={!field.isEnabled}
                  />
                  <Input
                    type="time"
                    {...form.register(`schedule.${index}.endTime`)}
                    disabled={!field.isEnabled}
                  />
                </div>
              </div>
            ))}

            {error && (
              <div className="flex items-center text-destructive">
                <AlertTriangle className="mr-2 h-4 w-4" />
                <p>{error}</p>
              </div>
            )}

            <Button type="submit" disabled={isSaving} className="w-full">
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                'Save Weekly Schedule'
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function TimeOffManager() {
  const [timeOffs, setTimeOffs] = useState<TimeOff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newReason, setNewReason] = useState('');
  const [newDate, setNewDate] = useState<Date | undefined>(new Date());
  const { toast } = useToast();

  const fetchTimeOffs = useCallback(() => {
    setIsLoading(true);
    setError(null);

    fetch('/api/provider/availability/time-off')
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(await res.text());
        }

        return res.json();
      })
      .then((data: TimeOff[]) => {
        setTimeOffs(data);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        console.error('[TIMEOFF_FETCH_ERROR]', err);
        const message = err instanceof Error ? err.message : 'Failed to load time-offs.';
        setError(message);
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchTimeOffs();
  }, [fetchTimeOffs]);

  const handleAddTimeOff = async (e: FormEvent) => {
    e.preventDefault();

    if (!newDate) {
      setError('Please select a date.');
      return;
    }

    const startTime = new Date(newDate);
    startTime.setHours(0, 0, 0, 0);
    const endTime = new Date(newDate);
    endTime.setHours(23, 59, 59, 999);

    try {
      const res = await fetch('/api/provider/availability/time-off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: newReason || 'Time Off',
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      toast({ title: 'Time Off Added' });
      setNewReason('');
      fetchTimeOffs();
    } catch (err: unknown) {
      console.error('[TIMEOFF_ADD_ERROR]', err);
      const message = err instanceof Error ? err.message : 'Failed to add time-off.';
      setError(message);
    }
  };

  const handleDeleteTimeOff = async (id: string) => {
    try {
      const res = await fetch(`/api/provider/availability/time-off/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      toast({ title: 'Time Off Removed' });
      fetchTimeOffs();
    } catch (err: unknown) {
      console.error('[TIMEOFF_DELETE_ERROR]', err);
      const message = err instanceof Error ? err.message : 'Failed to delete time-off.';
      setError(message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time Off & Holidays</CardTitle>
        <CardDescription>
          Block out specific dates you are unavailable. This will override your weekly hours.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleAddTimeOff}
          className="flex flex-col md:flex-row gap-2 mb-6 p-4 border rounded-lg"
        >
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full md:w-auto justify-start text-left font-normal"
                type="button"
              >
                {newDate ? format(newDate, 'PPP') : 'Select a date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar mode="single" selected={newDate} onSelect={setNewDate} initialFocus />
            </PopoverContent>
          </Popover>

          <Input
            placeholder="Reason (e.g., 'Public Holiday')"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
          />

          <Button type="submit" className="w-full md:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" /> Add Time Off
          </Button>
        </form>

        <div className="space-y-2">
          {isLoading && <p>Loading time-offs...</p>}
          {error && <p className="text-destructive">{error}</p>}

          {!isLoading && !error && timeOffs.length === 0 && (
            <p className="text-muted-foreground text-center">
              You have no time-offs scheduled.
            </p>
          )}

          {timeOffs.map((to) => (
            <div
              key={to.id}
              className="flex items-center justify-between p-3 bg-secondary rounded-lg"
            >
              <div>
                <p className="font-medium">{format(new Date(to.startTime), 'PPP')}</p>
                <p className="text-sm text-muted-foreground">{to.reason || 'Time Off'}</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this time-off?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove your time-off for {format(new Date(to.startTime), 'PPP')}.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDeleteTimeOff(to.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AvailabilityPage() {
  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8">
      <Tabs defaultValue="schedule" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="schedule">Weekly Schedule</TabsTrigger>
          <TabsTrigger value="time-off">Time Off & Holidays</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="mt-6">
          <WeeklyScheduleForm />
        </TabsContent>

        <TabsContent value="time-off" className="mt-6">
          <TimeOffManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}

