'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  isHidden: boolean;
  hiddenReason: string | null;
  provider?: { id: string; businessName: string | null } | null;
  service?: { id: string; title: string | null } | null;
  user?: { id: string; firstName: string | null; lastName: string | null } | null;
}

export function AdminReviewsTable() {
  const [items, setItems] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/reviews/list');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setItems(data.items ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (id: string, hide: boolean) => {
    try {
      const res = await fetch(`/api/admin/reviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: hide ? 'hide' : 'unhide' }),
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update review');
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading reviews…</div>;
  if (error) return <div className="text-sm text-destructive">{error}</div>;

  return (
    <div className="space-y-3">
      {items.map((r) => {
        const author = [r.user?.firstName, r.user?.lastName].filter(Boolean).join(' ') || 'Customer';
        return (
          <Card key={r.id} className="p-4">
            <CardContent className="p-0 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{r.rating} ★</Badge>
                  <span className="text-sm text-muted-foreground">
                    {r.provider?.businessName ?? 'Provider'} • {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {r.isHidden && <Badge variant="outline">Hidden</Badge>}
                  <Button size="sm" variant="outline" onClick={() => toggle(r.id, !r.isHidden)}>
                    {r.isHidden ? 'Unhide' : 'Hide'}
                  </Button>
                </div>
              </div>
              <Separator />
              <p className="text-sm">{r.comment || 'No comment provided.'}</p>
              <p className="text-xs text-muted-foreground">
                By {author} · Service: {r.service?.title ?? 'Unknown'}
              </p>
              {r.isHidden && r.hiddenReason && (
                <p className="text-xs text-amber-600">Reason: {r.hiddenReason}</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
