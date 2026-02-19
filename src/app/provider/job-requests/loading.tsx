import { Card, CardContent } from "@/components/ui/card";

function FeedSkeletonCard() {
  return (
    <Card className="border shadow-sm">
      <CardContent className="space-y-4 p-4">
        <div className="space-y-2">
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
          <div className="h-3 w-4/6 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-56 w-full animate-pulse rounded-md border bg-muted" />
        <div className="flex gap-2">
          <div className="h-9 w-24 animate-pulse rounded bg-muted" />
          <div className="h-9 w-24 animate-pulse rounded bg-muted" />
          <div className="h-9 w-24 animate-pulse rounded bg-muted" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function LoadingProviderJobRequestsPage() {
  return (
    <div className="mx-auto w-full max-w-180 space-y-4 px-4 py-6 md:px-6">
      <div className="h-7 w-40 animate-pulse rounded bg-muted" />
      <div className="flex gap-2">
        <div className="h-9 w-14 animate-pulse rounded bg-muted" />
        <div className="h-9 w-14 animate-pulse rounded bg-muted" />
        <div className="h-9 w-20 animate-pulse rounded bg-muted" />
      </div>
      <FeedSkeletonCard />
      <FeedSkeletonCard />
      <FeedSkeletonCard />
    </div>
  );
}
