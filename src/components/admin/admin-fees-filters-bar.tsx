"use client";

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calendar, Filter, X } from 'lucide-react';

export function AdminFeesFiltersBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const range = searchParams.get('range') ?? '30d';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const providerFilter = searchParams.get('providerSearch') ?? searchParams.get('provider') ?? '';

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

  const clearFilters = () => {
    updateParams({ range: null, from: null, to: null, providerSearch: null, provider: null });
  };

  const hasActiveFilters = range !== '30d' || from || to || providerFilter;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters & Date Range
          </CardTitle>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-2" />
              Clear All
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Date Ranges */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">Quick Ranges</div>
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
        </div>

        {/* Custom Date Range */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">Custom Range</div>
          <form
            onSubmit={handleCustomSubmit}
            className="flex flex-wrap items-center gap-2"
          >
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">From:</span>
            <Input
              type="date"
              name="from"
              defaultValue={from}
              className="w-35"
            />
            <span className="text-sm text-muted-foreground">To:</span>
            <Input
              type="date"
              name="to"
              defaultValue={to}
              className="w-35"
            />
            <Button type="submit" size="sm" variant="outline">
              Apply
            </Button>
          </form>
        </div>

        {/* Provider Filter */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">Provider Filter</div>
          <div className="max-w-sm">
            <Input
              placeholder="Search providers..."
              defaultValue={providerFilter}
              onBlur={(event) => {
                updateParams({ providerSearch: event.target.value || null, provider: null });
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  updateParams({
                    providerSearch: (event.target as HTMLInputElement).value || null,
                    provider: null,
                  });
                }
              }}
            />
          </div>
        </div>

        {/* Active Filters Display */}
        {hasActiveFilters && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Active Filters</div>
            <div className="flex flex-wrap gap-2">
              {range !== '30d' && (
                <Badge variant="secondary" className="text-xs">
                  Range: {range === '7d' ? 'Last 7 days' :
                          range === 'month' ? 'This month' :
                          range === 'ytd' ? 'Year to date' :
                          range === 'all' ? 'All time' : range}
                </Badge>
              )}
              {from && (
                <Badge variant="secondary" className="text-xs">
                  From: {new Date(from).toLocaleDateString()}
                </Badge>
              )}
              {to && (
                <Badge variant="secondary" className="text-xs">
                  To: {new Date(to).toLocaleDateString()}
                </Badge>
              )}
              {providerFilter && (
                <Badge variant="secondary" className="text-xs">
                  Provider: {providerFilter}
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
