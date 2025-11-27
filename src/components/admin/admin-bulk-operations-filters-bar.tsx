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
}

export function AdminBulkOperationsFiltersBar({
  operationType,
  searchParams,
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
                    <SelectItem value="confirmed">Confirmed</SelectItem>
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
                  <SelectItem value="Auckland">Auckland</SelectItem>
                  <SelectItem value="Wellington">Wellington</SelectItem>
                  <SelectItem value="Christchurch">Christchurch</SelectItem>
                  <SelectItem value="Dunedin">Dunedin</SelectItem>
                  <SelectItem value="Hamilton">Hamilton</SelectItem>
                  <SelectItem value="Tauranga">Tauranga</SelectItem>
                  <SelectItem value="Napier">Napier</SelectItem>
                  <SelectItem value="Palmerston North">Palmerston North</SelectItem>
                  <SelectItem value="Nelson">Nelson</SelectItem>
                  <SelectItem value="Rotorua">Rotorua</SelectItem>
                  <SelectItem value="New Plymouth">New Plymouth</SelectItem>
                  <SelectItem value="Whangarei">Whangarei</SelectItem>
                  <SelectItem value="Invercargill">Invercargill</SelectItem>
                  <SelectItem value="Whanganui">Whanganui</SelectItem>
                  <SelectItem value="Gisborne">Gisborne</SelectItem>
                  <SelectItem value="Timaru">Timaru</SelectItem>
                  <SelectItem value="Blenheim">Blenheim</SelectItem>
                  <SelectItem value="Pukekohe">Pukekohe</SelectItem>
                  <SelectItem value="Taupo">Taupo</SelectItem>
                  <SelectItem value="Masterton">Masterton</SelectItem>
                  <SelectItem value="Levin">Levin</SelectItem>
                  <SelectItem value="Ashburton">Ashburton</SelectItem>
                  <SelectItem value="Whakatane">Whakatane</SelectItem>
                  <SelectItem value="Matamata">Matamata</SelectItem>
                  <SelectItem value="Waiuku">Waiuku</SelectItem>
                  <SelectItem value="Te Awamutu">Te Awamutu</SelectItem>
                  <SelectItem value="Huntly">Huntly</SelectItem>
                  <SelectItem value="Feilding">Feilding</SelectItem>
                  <SelectItem value="Dargaville">Dargaville</SelectItem>
                  <SelectItem value="Kerikeri">Kerikeri</SelectItem>
                  <SelectItem value="Kaitaia">Kaitaia</SelectItem>
                  <SelectItem value="Te Anau">Te Anau</SelectItem>
                  <SelectItem value="Wanaka">Wanaka</SelectItem>
                  <SelectItem value="Franz Josef">Franz Josef</SelectItem>
                  <SelectItem value="Queenstown">Queenstown</SelectItem>
                  <SelectItem value="Arrowtown">Arrowtown</SelectItem>
                  <SelectItem value="Cromwell">Cromwell</SelectItem>
                  <SelectItem value="Alexandra">Alexandra</SelectItem>
                  <SelectItem value="Balclutha">Balclutha</SelectItem>
                  <SelectItem value="Milton">Milton</SelectItem>
                  <SelectItem value="Lawrence">Lawrence</SelectItem>
                  <SelectItem value="Ranfurly">Ranfurly</SelectItem>
                  <SelectItem value="Roxburgh">Roxburgh</SelectItem>
                  <SelectItem value="Tapanui">Tapanui</SelectItem>
                  <SelectItem value="Wyndham">Wyndham</SelectItem>
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