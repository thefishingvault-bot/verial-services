'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface ProviderRow {
  id: string;
  businessName: string;
  handle: string;
  status: string;
  trustLevel: string;
  trustScore: number;
  baseRegion: string;
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
  };
}

export function BulkOperationsClient({ operationType, filters }: BulkOperationsClientProps) {
  const [items, setItems] = useState<(ProviderRow | BookingRow)[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const url = new URL('/api/admin/bulk/list', window.location.origin);
      url.searchParams.set('type', operationType);
      url.searchParams.set('status', filters.status);
      url.searchParams.set('region', filters.region);
      url.searchParams.set('q', filters.q);

      const response = await fetch(url.toString());
      if (response.ok) {
        const data = await response.json();
        setItems(data.items);
        setTotalCount(data.totalCount);
      }
    } catch (error) {
      console.error('Error fetching items:', error);
    } finally {
      setLoading(false);
    }
  }, [filters, operationType]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

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
        alert(`Successfully performed ${action} on ${selectedIds.length} ${operationType}`);
        setSelectedIds([]);
        fetchItems(); // Refresh the data
      } else {
        alert('Failed to perform bulk action');
      }
    } catch (error) {
      console.error('Error performing bulk action:', error);
      alert('Error performing bulk action');
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
            onSelectAll={handleSelectAll}
            onSelectItem={handleSelectItem}
            onBulkAction={handleBulkAction}
          />
        )}
      </CardContent>
    </Card>
  );
}

interface BulkOperationsTableProps {
  items: (ProviderRow | BookingRow)[];
  operationType: 'providers' | 'bookings';
  selectedIds: string[];
  onSelectAll: (checked: boolean) => void;
  onSelectItem: (id: string, checked: boolean) => void;
  onBulkAction: (action: string) => void;
}

function BulkOperationsTable({
  items,
  operationType,
  selectedIds,
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
                      <AlertDialogAction onClick={() => onBulkAction('suspend')}>
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
                      <AlertDialogAction onClick={() => onBulkAction('unsuspend')}>
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
                      <AlertDialogAction onClick={() => onBulkAction('reject')}>
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
                        This will cancel {selectedIds.length} bookings. Refunds will be processed automatically.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onBulkAction('cancel')}>
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
                      <AlertDialogAction onClick={() => onBulkAction('complete')}>
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
      <TableCell className="text-sm">{provider.baseRegion || '—'}</TableCell>
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