'use client';

import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Form } from '@/components/ui/form';

const DAYS_OF_WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

interface ScheduleDay {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  isEnabled: boolean;
}

type FormValues = {
  schedule: ScheduleDay[];
};

export default function AvailabilityPage() {
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
            // Provider not found or no schedule yet; keep defaults
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
    <div className="max-w-3xl mx-auto p-4 md:p-8">
      <Card>
        <CardHeader>
          <CardTitle>Your Availability</CardTitle>
          <CardDescription>
            Set your recurring weekly hours. Customers will only be able to book you during these times.
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
                  'Save Availability'
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

