'use client';

import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

interface SearchParams {
  q?: string;
  category?: string;
  region?: string;
  location?: string;
  minPrice?: string;
  maxPrice?: string;
  rating?: string;
  availability?: string;
  sort?: string;
  view?: 'grid' | 'map';
  page?: string;
  pageSize?: string;
}

interface LoadMoreButtonProps {
  searchParams: SearchParams;
  currentPage: number;
  hasMore: boolean;
  onLoadMore?: () => void;
  isLoading?: boolean;
}

export function LoadMoreButton({
  searchParams,
  currentPage,
  hasMore,
  onLoadMore,
  isLoading,
}: LoadMoreButtonProps) {
  const router = useRouter();

  const handleLoadMore = () => {
    if (onLoadMore) {
      onLoadMore();
      return;
    }
    const newParams = new URLSearchParams();
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== undefined) {
        newParams.set(key, value);
      }
    });
    newParams.set('page', (currentPage + 1).toString());
    router.push(`/services?${newParams.toString()}`);
  };

  if (!hasMore) return null;

  return (
    <div className="text-center pt-6">
      <Button
        variant="outline"
        size="lg"
        onClick={handleLoadMore}
        disabled={Boolean(isLoading)}
      >
        {isLoading ? "Loading…" : "Load More Services"}
      </Button>
    </div>
  );
}