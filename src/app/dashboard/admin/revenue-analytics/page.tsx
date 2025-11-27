import { Suspense } from 'react';
import { RevenueAnalyticsClient } from '@/components/admin/revenue-analytics-client';

export default function RevenueAnalyticsPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Revenue Analytics</h1>
        <p className="text-muted-foreground mt-2">
          Comprehensive financial reporting and revenue insights for the platform
        </p>
      </div>

      <Suspense fallback={<div>Loading revenue analytics...</div>}>
        <RevenueAnalyticsClient />
      </Suspense>
    </div>
  );
}