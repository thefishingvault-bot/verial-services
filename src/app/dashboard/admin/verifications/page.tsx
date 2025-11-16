'use client';

import { useState, useEffect, useCallback } from 'react';
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
}

export default function AdminVerificationsPage() {
  const [providers, setProviders] = useState<ProviderData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchProviders = useCallback(() => {
    setIsLoading(true);
    fetch('/api/admin/providers/list')
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
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

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
      <h2 className="text-2xl font-semibold mb-4">Pending Verifications ({pendingProviders.length})</h2>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Handle</TableHead>
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
                  <div className="font-medium">{p.businessName}</div>
                  <div className="text-sm text-muted-foreground">{p.userId}</div>
                </TableCell>
                <TableCell>
                  <code className="text-sm">@{p.handle}</code>
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
              <TableHead>Stripe Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {otherProviders.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">No other providers.</TableCell>
              </TableRow>
            )}
            {otherProviders.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-medium">{p.businessName}</div>
                  <div className="text-sm text-muted-foreground">{p.userId}</div>
                </TableCell>
                <TableCell>
                  <code className="text-sm">@{p.handle}</code>
                </TableCell>
                <TableCell>
                  <Badge variant={p.status === 'approved' ? 'default' : 'destructive'}>
                    {p.status}
                  </Badge>
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

