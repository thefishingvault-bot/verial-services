"use client";

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AdminProvidersFiltersBarProps {
  searchParams: {
    q?: string;
    status?: string;
    region?: string;
    stripe?: string;
    verified?: string;
    page?: string;
  };
  regions: string[];
}

export function AdminProvidersFiltersBar({ searchParams, regions }: AdminProvidersFiltersBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const urlSearchParams = useSearchParams();

  const q = searchParams.q ?? '';
  const status = searchParams.status ?? 'all';
  const region = searchParams.region ?? 'all';
  const stripe = searchParams.stripe ?? 'all';
  const verified = searchParams.verified === '1';

  const updateQuery = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(urlSearchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    params.set('page', '1');

    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const value = (formData.get('q') as string) ?? '';
    updateQuery({ q: value || null });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Filters</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <form onSubmit={handleSearchSubmit} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              name="q"
              defaultValue={q}
              placeholder="Search providers by name, handle, or email…"
            />
            <Button type="submit" className="sm:ml-2">
              Search
            </Button>
          </form>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={status}
              onValueChange={(value) => {
                updateQuery({ status: value === 'all' ? null : value });
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={region}
              onValueChange={(value) => {
                updateQuery({ region: value === 'all' ? null : value });
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All regions</SelectItem>
                {regions.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={stripe}
              onValueChange={(value) => {
                updateQuery({ stripe: value === 'all' ? null : value });
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Stripe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stripe states</SelectItem>
                <SelectItem value="connected">Connected</SelectItem>
                <SelectItem value="disconnected">Disconnected</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Checkbox
                id="verified"
                checked={verified}
                onCheckedChange={(checked) => {
                  const isChecked = checked === true;
                  updateQuery({ verified: isChecked ? '1' : null });
                }}
              />
              <label htmlFor="verified" className="text-sm">
                Verified only
              </label>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                router.push(pathname);
              }}
            >
              Clear filters
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
