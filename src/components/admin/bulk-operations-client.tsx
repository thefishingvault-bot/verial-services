'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';

interface ProviderRow {
  id: string;
  businessName: string;
  handle: string;
  status: string;
  trustLevel: string;
  trustScore: number;
  region: string | null;
  createdAt: string;
  userEmail: string;
}

interface BookingRow {
  id: string;
  status: string;
  scheduledDate: string;
  totalAmount: number;
  providerName: string;
  customerEmail: string;
  serviceTitle: string;
  createdAt: string;
}

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(cents / 100);

interface BulkOperationsClientProps {
  operationType: 'providers' | 'bookings';
  filters: {
    status: string;
    region: string;
    q: string;
    page: number;
    pageSize: number;
  };
}

export function BulkOperationsClient({ operationType, filters }: BulkOperationsClientProps) {
  const router = useRouter();
  const currentParams = useSearchParams();

  const [items, setItems] = useState<(ProviderRow | BookingRow)[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(filters.page);
  const [pageSize, setPageSize] = useState(filters.pageSize);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [acting, setActing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Keep state in sync with URL-driven server defaults
    setPage(filters.page);
    setPageSize(filters.pageSize);
  }, [filters.page, filters.pageSize]);

  const updatePaginationInUrl = useCallback(
    (next: { page?: number; pageSize?: number }) => {
      const params = new URLSearchParams(currentParams.toString());
      if (typeof next.page === 'number') params.set('page', String(next.page));
      if (typeof next.pageSize === 'number') params.set('pageSize', String(next.pageSize));
      router.push(`?${params.toString()}`);
    },
    [currentParams, router],
  );

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const url = new URL('/api/admin/bulk/list', window.location.origin);
      url.searchParams.set('type', operationType);
      url.searchParams.set('status', filters.status);
      url.searchParams.set('region', filters.region);
      url.searchParams.set('q', filters.q);
      url.searchParams.set('page', String(page));
      url.searchParams.set('pageSize', String(pageSize));

      const response = await fetch(url.toString());
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const msg = data?.error ? String(data.error) : `Failed to load ${operationType}.`;
        setErrorMessage(msg);
        toast({
          title: 'Failed to load list',
          description: msg,
          variant: 'destructive',
        });
        return;
      }

      const data = await response.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotalCount(typeof data.totalCount === 'number' ? data.totalCount : 0);
      setTotalPages(typeof data.totalPages === 'number' ? data.totalPages : 1);
    } catch (error) {
      console.error('Error fetching items:', error);
      const msg = 'Network error while loading list.';
      setErrorMessage(msg);
      toast({
        title: 'Failed to load list',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [filters.q, filters.region, filters.status, operationType, page, pageSize, toast]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    // Avoid carrying selections across pages/filters.
    setSelectedIds([]);
  }, [operationType, filters.q, filters.region, filters.status, page, pageSize]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(items.map(item => item.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectItem = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(itemId => itemId !== id));
    }
  };

  const handleBulkAction = async (action: string) => {
    if (selectedIds.length === 0) return;

    setActing(true);

    try {
      const response = await fetch('/api/admin/bulk/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: operationType,
          action,
          ids: selectedIds,
        }),
      });

      if (response.ok) {
        const data = await response.json().catch(() => null);
        const affected = typeof data?.affected === 'number' ? data.affected : selectedIds.length;

        toast({
          title: 'Bulk action complete',
          description: `${action} applied to ${affected} ${operationType}.`,
        });
        setSelectedIds([]);
        fetchItems(); // Refresh the data
      } else {
        const data = await response.json().catch(() => null);
        toast({
          title: 'Bulk action failed',
          description: data?.error ? String(data.error) : 'Failed to perform bulk action.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error performing bulk action:', error);
      toast({
        title: 'Bulk action failed',
        description: 'Network error while performing bulk action.',
        variant: 'destructive',
      });
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (errorMessage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Failed to load</CardTitle>
          <CardDescription>{errorMessage}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={fetchItems} disabled={loading}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {operationType === 'providers' ? 'Providers' : 'Bookings'} ({totalCount} total)
        </CardTitle>
        <CardDescription>
          Select items to perform bulk operations
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No {operationType} found matching the current filters.
          </div>
        ) : (
          <BulkOperationsTable
            items={items}
            operationType={operationType}
            selectedIds={selectedIds}
            acting={acting}
            onSelectAll={handleSelectAll}
            onSelectItem={handleSelectItem}
            onBulkAction={handleBulkAction}
          />
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4">
            <div className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const nextPage = Math.max(1, page - 1);
                  setPage(nextPage);
                  updatePaginationInUrl({ page: nextPage });
                }}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const nextPage = Math.min(totalPages, page + 1);
                  setPage(nextPage);
                  updatePaginationInUrl({ page: nextPage });
                }}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface BulkOperationsTableProps {
  items: (ProviderRow | BookingRow)[];
  operationType: 'providers' | 'bookings';
  selectedIds: string[];
  acting: boolean;
  onSelectAll: (checked: boolean) => void;
  onSelectItem: (id: string, checked: boolean) => void;
  onBulkAction: (action: string) => void;
}

function BulkOperationsTable({
  items,
  operationType,
  selectedIds,
  acting,
  onSelectAll,
  onSelectItem,
  onBulkAction,
}: BulkOperationsTableProps) {
  return (
    <div className="space-y-4">
      {/* Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">
            {selectedIds.length} {operationType} selected
          </span>
          <div className="flex gap-2 ml-auto">
            {operationType === 'providers' ? (
              <>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      Suspend Selected
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Suspend Providers</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will suspend {selectedIds.length} providers. They will not be able to accept new bookings but can complete existing ones.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onBulkAction('suspend')} disabled={acting}>
                        Suspend
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      Unsuspend Selected
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Unsuspend Providers</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will unsuspend {selectedIds.length} providers, restoring their full access.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onBulkAction('unsuspend')} disabled={acting}>
                        Unsuspend
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      Reject Applications
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reject Provider Applications</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will reject {selectedIds.length} provider applications. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onBulkAction('reject')} disabled={acting}>
                        Reject
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : (
              <>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      Cancel Bookings
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel Bookings</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will cancel {selectedIds.length} bookings. Any refunds, if applicable, must be processed separately.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onBulkAction('cancel')} disabled={acting}>
                        Cancel
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      Mark Completed
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Mark Bookings Completed</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will mark {selectedIds.length} bookings as completed.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onBulkAction('complete')} disabled={acting}>
                        Complete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                checked={selectedIds.length === items.length && items.length > 0}
                onCheckedChange={onSelectAll}
                disabled={acting}
              />
            </TableHead>
            {operationType === 'providers' ? (
              <>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trust</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Joined</TableHead>
              </>
            ) : (
              <>
                <TableHead>Booking</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Scheduled</TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <Checkbox
                  checked={selectedIds.includes(item.id)}
                  onCheckedChange={(checked) => onSelectItem(item.id, checked as boolean)}
                  disabled={acting}
                />
              </TableCell>
              {operationType === 'providers' ? (
                <ProviderTableRow provider={item as ProviderRow} />
              ) : (
                <BookingTableRow booking={item as BookingRow} />
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ProviderTableRow({ provider }: { provider: ProviderRow }) {
  return (
    <>
      <TableCell>
        <div className="font-medium">{provider.businessName}</div>
        <div className="text-sm text-muted-foreground">@{provider.handle}</div>
        <div className="text-xs text-muted-foreground">{provider.userEmail}</div>
      </TableCell>
      <TableCell>
        <Badge variant={
          provider.status === 'approved' ? 'default' :
          provider.status === 'pending' ? 'secondary' : 'destructive'
        }>
          {provider.status}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="text-sm font-medium">{provider.trustScore}</div>
        <div className="text-xs text-muted-foreground capitalize">{provider.trustLevel}</div>
      </TableCell>
      <TableCell className="text-sm">{provider.region || '—'}</TableCell>
      <TableCell className="text-sm">{new Date(provider.createdAt).toLocaleDateString()}</TableCell>
    </>
  );
}

function BookingTableRow({ booking }: { booking: BookingRow }) {
  return (
    <>
      <TableCell>
        <div className="font-mono text-sm">{booking.id.slice(-8)}</div>
        <div className="text-xs text-muted-foreground">{booking.customerEmail}</div>
      </TableCell>
      <TableCell>
        <Badge variant={
          booking.status === 'completed' ? 'default' :
          booking.status === 'paid' ? 'secondary' :
          booking.status === 'accepted' ? 'secondary' :
          booking.status === 'pending' ? 'outline' :
          booking.status === 'declined' ? 'destructive' :
          booking.status?.startsWith('canceled') ? 'destructive' : 'outline'
        }>
          {booking.status}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="text-sm font-medium">{booking.serviceTitle}</div>
        <div className="text-xs text-muted-foreground">{booking.providerName}</div>
      </TableCell>
      <TableCell className="text-sm font-medium">{formatCurrency(booking.totalAmount)}</TableCell>
      <TableCell className="text-sm">
        {booking.scheduledDate ? new Date(booking.scheduledDate).toLocaleDateString() : '—'}
      </TableCell>
    </>
  );
}