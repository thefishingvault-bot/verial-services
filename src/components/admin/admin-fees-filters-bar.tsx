"use client";

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AdminFeesFiltersBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const range = searchParams.get('range') ?? '30d';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const providerFilter = searchParams.get('provider') ?? '';

  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const applyRange = (value: string) => {
    updateParams({ range: value, from: null, to: null });
  };

  const handleCustomSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const fromValue = (formData.get('from') as string) || '';
    const toValue = (formData.get('to') as string) || '';
    updateParams({ from: fromValue || null, to: toValue || null });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Filters</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={range === '7d' ? 'default' : 'outline'}
            size="sm"
            onClick={() => applyRange('7d')}
          >
            Last 7 days
          </Button>
          <Button
            type="button"
            variant={range === '30d' ? 'default' : 'outline'}
            size="sm"
            onClick={() => applyRange('30d')}
          >
            Last 30 days
          </Button>
          <Button
            type="button"
            variant={range === 'month' ? 'default' : 'outline'}
            size="sm"
            onClick={() => applyRange('month')}
          >
            This month
          </Button>
          <Button
            type="button"
            variant={range === 'ytd' ? 'default' : 'outline'}
            size="sm"
            onClick={() => applyRange('ytd')}
          >
            Year to date
          </Button>
          <Button
            type="button"
            variant={range === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => applyRange('all')}
          >
            All time
          </Button>
        </div>

        <form
          onSubmit={handleCustomSubmit}
          className="flex flex-wrap items-center gap-2 text-sm"
        >
          <span className="text-muted-foreground">Custom range:</span>
          <Input
            type="date"
            name="from"
            defaultValue={from}
            className="w-[140px]"
          />
          <span>to</span>
          <Input
            type="date"
            name="to"
            defaultValue={to}
            className="w-[140px]"
          />
          <Button type="submit" size="sm" variant="outline">
            Apply
          </Button>
        </form>

        <div className="flex items-center gap-2">
          <Input
            placeholder="Filter providers"
            className="w-[220px]"
            defaultValue={providerFilter}
            onBlur={(event) => {
              updateParams({ provider: event.target.value || null });
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                updateParams({ provider: (event.target as HTMLInputElement).value || null });
              }
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
