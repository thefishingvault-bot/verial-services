import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function ServicesLoading() {
  return (
    <div className="space-y-6">
      {/* Results Header Skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-6 w-48 mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>

      {/* Services Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 9 }).map((_, index) => (
          <Card key={index} className="overflow-hidden">
            <CardHeader className="p-0">
              {/* Image Skeleton */}
              <Skeleton className="aspect-video w-full" />
            </CardHeader>

            <CardContent className="p-4 space-y-3">
              {/* Title and Price */}
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
                <div className="text-right space-y-1">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-3 w-12" />
                </div>
              </div>

              {/* Provider Info */}
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="space-y-1 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>

              {/* Rating */}
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 w-8" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}