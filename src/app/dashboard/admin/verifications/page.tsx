'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, AlertTriangle } from 'lucide-react';

// Define the type for the provider data
interface ProviderData {
  id: string;
  businessName: string;
  handle: string;
  status: 'pending' | 'approved' | 'rejected';
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  userId: string;
  baseSuburb: string | null;
  baseRegion: string | null;
  serviceRadiusKm: number | null;
}

export default function AdminVerificationsPage() {
  const [providers, setProviders] = useState<ProviderData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const q = searchParams.get('q') ?? '';
  const status = searchParams.get('status') ?? 'all';
  const region = searchParams.get('region') ?? 'all';
  const charges = searchParams.get('charges') === '1';
  const payouts = searchParams.get('payouts') === '1';

  const [searchInput, setSearchInput] = useState(q);

  const fetchProviders = useCallback(() => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status !== 'all') params.set('status', status);
    if (region !== 'all') params.set('region', region);
    if (charges) params.set('charges', '1');
    if (payouts) params.set('payouts', '1');

    const queryString = params.toString();

    fetch(`/api/admin/providers/list${queryString ? `?${queryString}` : ''}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch providers.');
        return res.json();
      })
      .then((data) => {
        setProviders(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [q, status, region, charges, payouts]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  const regions = useMemo(() => {
    const regionSet = new Set<string>();
    providers.forEach((p) => {
      if (p.baseRegion) {
        regionSet.add(p.baseRegion);
      }
    });
    return Array.from(regionSet).sort((a, b) => a.localeCompare(b));
  }, [providers]);

  const updateSearchParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '' || value === 'all') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    params.delete('page');

    const query = params.toString();
    router.push(`${pathname}${query ? `?${query}` : ''}`);
  };

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    updateSearchParams({ q: searchInput || null });
  };

  const handleStatusChange = (value: string) => {
    updateSearchParams({ status: value === 'all' ? null : value });
  };

  const handleRegionChange = (value: string) => {
    updateSearchParams({ region: value === 'all' ? null : value });
  };

  const handleChargesChange = (checked: boolean | 'indeterminate') => {
    const isChecked = checked === true;
    updateSearchParams({ charges: isChecked ? '1' : null });
  };

  const handlePayoutsChange = (checked: boolean | 'indeterminate') => {
    const isChecked = checked === true;
    updateSearchParams({ payouts: isChecked ? '1' : null });
  };

  const handleResetFilters = () => {
    router.push(pathname);
  };

  const handleUpdateStatus = async (providerId: string, newStatus: ProviderData['status']) => {
    setActionLoading(providerId);
    try {
      const res = await fetch('/api/admin/verify-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, newStatus }),
      });
      if (!res.ok) throw new Error(await res.text());

      fetchProviders(); // Refresh the list
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to update ${providerId}: ${message}`);
    } finally {
      setActionLoading(null);
    }
  };

  if (isLoading) {
    return <div className="flex items-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading providers...</div>;
  }

  if (error) {
    return <div className="flex items-center text-destructive"><AlertTriangle className="mr-2 h-4 w-4" />{error}</div>;
  }

  const pendingProviders = providers.filter((p) => p.status === 'pending');
  const otherProviders = providers.filter((p) => p.status !== 'pending');

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <form onSubmit={handleSearchSubmit} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            placeholder="Search providers (handle, business, user ID)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Button type="submit" className="sm:ml-2">
            Search
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={status} onValueChange={handleStatusChange}>
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

          <Select value={region} onValueChange={handleRegionChange}>
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

          <div className="flex items-center gap-2">
            <Checkbox id="charges" checked={charges} onCheckedChange={handleChargesChange} />
            <label htmlFor="charges" className="text-sm">
              Charges enabled only
            </label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="payouts" checked={payouts} onCheckedChange={handlePayoutsChange} />
            <label htmlFor="payouts" className="text-sm">
              Payouts enabled only
            </label>
          </div>

          <Button variant="outline" size="sm" onClick={handleResetFilters}>
            Reset filters
          </Button>
        </div>
      </div>
      <h2 className="text-2xl font-semibold mb-4">Pending Verifications ({pendingProviders.length})</h2>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Handle</TableHead>
              <TableHead>Service area</TableHead>
              <TableHead>Stripe Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingProviders.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">No pending verifications.</TableCell>
              </TableRow>
            )}
            {pendingProviders.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-medium">
                    <Link href={`/dashboard/admin/providers/${p.id}`} className="hover:underline">
                      {p.businessName}
                    </Link>
                  </div>
                  <div className="text-sm text-muted-foreground">{p.userId}</div>
                </TableCell>
                <TableCell>
                  <Link href={`/dashboard/admin/providers/${p.id}`} className="hover:underline">
                    <code className="text-sm">@{p.handle}</code>
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.serviceRadiusKm && (p.baseSuburb || p.baseRegion)
                    ? p.baseSuburb
                      ? `${p.serviceRadiusKm} km from ${p.baseSuburb}`
                      : `${p.serviceRadiusKm} km in ${p.baseRegion}`
                    : 'Not set'}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    {p.chargesEnabled ? <Badge>Charges ✓</Badge> : <Badge variant="outline">Charges ✗</Badge>}
                    {p.payoutsEnabled ? <Badge>Payouts ✓</Badge> : <Badge variant="outline">Payouts ✗</Badge>}
                  </div>
                </TableCell>
                <TableCell className="space-x-2">
                  <Button
                    size="sm"
                    disabled={actionLoading === p.id}
                    onClick={() => handleUpdateStatus(p.id, 'approved')}
                  >
                    {actionLoading === p.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={actionLoading === p.id}
                    onClick={() => handleUpdateStatus(p.id, 'rejected')}
                  >
                    {actionLoading === p.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Reject
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <h2 className="text-2xl font-semibold my-8">All Other Providers ({otherProviders.length})</h2>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Handle</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Service area</TableHead>
              <TableHead>Stripe Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {otherProviders.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">No other providers.</TableCell>
              </TableRow>
            )}
            {otherProviders.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-medium">
                    <Link href={`/dashboard/admin/providers/${p.id}`} className="hover:underline">
                      {p.businessName}
                    </Link>
                  </div>
                  <div className="text-sm text-muted-foreground">{p.userId}</div>
                </TableCell>
                <TableCell>
                  <Link href={`/dashboard/admin/providers/${p.id}`} className="hover:underline">
                    <code className="text-sm">@{p.handle}</code>
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={p.status === 'approved' ? 'default' : 'destructive'}>
                    {p.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.serviceRadiusKm && (p.baseSuburb || p.baseRegion)
                    ? p.baseSuburb
                      ? `${p.serviceRadiusKm} km from ${p.baseSuburb}`
                      : `${p.serviceRadiusKm} km in ${p.baseRegion}`
                    : 'Not set'}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    {p.chargesEnabled ? <Badge>Charges ✓</Badge> : <Badge variant="outline">Charges ✗</Badge>}
                    {p.payoutsEnabled ? <Badge>Payouts ✓</Badge> : <Badge variant="outline">Payouts ✗</Badge>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

