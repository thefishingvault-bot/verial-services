'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ReviewItem = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  user?: {
    firstName: string | null;
    lastName: string | null;
  } | null;
  isHidden?: boolean;
};

interface ReviewListProps {
  serviceId: string;
  initialItems: ReviewItem[];
  initialTotal: number;
  pageSize?: number;
}

export function ReviewList({ serviceId, initialItems, initialTotal, pageSize = 10 }: ReviewListProps) {
  const [items, setItems] = useState<ReviewItem[]>(initialItems);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setItems(initialItems);
    setTotal(initialTotal);
    setPage(1);
  }, [initialItems, initialTotal]);

  const loadMore = async () => {
    setLoading(true);
    try {
      const nextPage = page + 1;
      const res = await fetch(`/api/reviews/service/${serviceId}?page=${nextPage}&pageSize=${pageSize}`);
      if (!res.ok) throw new Error('Failed to load reviews');
      const data = await res.json();
      setItems((prev) => [...prev, ...(data.items ?? [])]);
      setTotal(data.total ?? total);
      setPage(nextPage);
    } catch (err) {
      console.error('[REVIEW_LIST]', err);
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No reviews yet.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((review) => {
        const name = [review.user?.firstName, review.user?.lastName?.charAt(0)]
          .filter(Boolean)
          .join(' ');
        return (
          <div key={review.id} className={cn('rounded-lg border p-3 bg-white', review.isHidden && 'opacity-60')}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{name || 'Customer'}</span>
              <span className="text-yellow-500 font-semibold">{review.rating} ★</span>
            </div>
            {review.comment && <p className="text-sm text-muted-foreground mt-1">{review.comment}</p>}
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-2">
              <span>{new Date(review.createdAt).toLocaleDateString('en-NZ')}</span>
              {review.isHidden ? <span className="italic">Hidden by admin</span> : null}
            </div>
          </div>
        );
      })}

      {items.length < total && (
        <div className="pt-2">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load more reviews'}
          </Button>
        </div>
      )}
    </div>
  );
}
