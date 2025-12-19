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
  };
  regionOptions?: string[];
}

export function AdminBulkOperationsFiltersBar({
  operationType,
  searchParams,
  regionOptions,
}: AdminBulkOperationsFiltersBarProps) {
  const router = useRouter();
  const currentParams = useSearchParams();

  const [status, setStatus] = useState(searchParams.status || 'all');
  const [region, setRegion] = useState(searchParams.region || 'all');
  const [q, setQ] = useState(searchParams.q || '');

  const handleFilter = () => {
    const params = new URLSearchParams(currentParams.toString());
    params.set('type', operationType);
    params.set('status', status);
    params.set('region', region);
    params.set('q', q);
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
          <div className="flex-1 min-w-[200px]">
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

          <div className="min-w-[150px]">
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
            <div className="min-w-[150px]">
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