'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';

interface AdminBulkOperationsFiltersBarProps {
  operationType: 'providers' | 'bookings';
  searchParams: {
    status?: string;
    region?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  };
  regionOptions?: string[];
}

export function AdminBulkOperationsFiltersBar({
  operationType,
  searchParams,
  regionOptions,
}: AdminBulkOperationsFiltersBarProps) {
  const stateKey = [
    operationType,
    searchParams.status ?? 'all',
    searchParams.region ?? 'all',
    searchParams.q ?? '',
    typeof searchParams.page === 'number' ? String(searchParams.page) : '',
    typeof searchParams.pageSize === 'number' ? String(searchParams.pageSize) : '',
  ].join('|');

  return (
    <AdminBulkOperationsFiltersBarInner
      key={stateKey}
      operationType={operationType}
      searchParams={searchParams}
      regionOptions={regionOptions}
    />
  );
}

function AdminBulkOperationsFiltersBarInner({
  operationType,
  searchParams,
  regionOptions,
}: AdminBulkOperationsFiltersBarProps) {
  const router = useRouter();
  const currentParams = useSearchParams();

  const [status, setStatus] = useState(searchParams.status || 'all');
  const [region, setRegion] = useState(searchParams.region || 'all');
  const [q, setQ] = useState(searchParams.q || '');

  const buildParams = (nextType: 'providers' | 'bookings') => {
    const params = new URLSearchParams(currentParams.toString());
    params.set('type', nextType);
    params.set('status', status);
    params.set('region', region);
    params.set('q', q);

    // Preserve pagination if present
    if (typeof searchParams.page === 'number') params.set('page', String(searchParams.page));
    if (typeof searchParams.pageSize === 'number') params.set('pageSize', String(searchParams.pageSize));

    return params;
  };

  const handleTypeSwitch = (nextType: 'providers' | 'bookings') => {
    const params = buildParams(nextType);
    router.push(`?${params.toString()}`);
  };

  const handleFilter = () => {
    const params = buildParams(operationType);
    router.push(`?${params.toString()}`);
  };

  const handleReset = () => {
    setStatus('all');
    setRegion('all');
    setQ('');
    const params = new URLSearchParams();
    params.set('type', operationType);
    router.push(`?${params.toString()}`);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={operationType === 'providers' ? 'default' : 'outline'}
              onClick={() => handleTypeSwitch('providers')}
            >
              Providers
            </Button>
            <Button
              type="button"
              variant={operationType === 'bookings' ? 'default' : 'outline'}
              onClick={() => handleTypeSwitch('bookings')}
            >
              Bookings
            </Button>
          </div>

          <div className="flex-1 min-w-50">
            <label className="block text-sm font-medium mb-2">Search</label>
            <Input
              placeholder={
                operationType === 'providers'
                  ? 'Provider name, handle, or email...'
                  : 'Service title, provider name, or customer email...'
              }
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="min-w-37.5">
            <label className="block text-sm font-medium mb-2">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {operationType === 'providers' ? (
                  <>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="accepted">Confirmed</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="canceled">Canceled</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          {operationType === 'providers' && (
            <div className="min-w-37.5">
              <label className="block text-sm font-medium mb-2">Region</label>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Regions</SelectItem>
                  {(regionOptions ?? []).map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleFilter} variant="default">
              Filter
            </Button>
            <Button onClick={handleReset} variant="outline">
              Reset
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}