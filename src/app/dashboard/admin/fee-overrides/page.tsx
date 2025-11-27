import { Suspense } from 'react';
import { FeeOverridesClient } from '@/components/admin/fee-overrides-client';

export default function FeeOverridesPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Fee Policy Overrides</h1>
        <p className="text-muted-foreground mt-2">
          Configure custom fee policies for providers and service categories
        </p>
      </div>

      <Suspense fallback={<div>Loading fee overrides...</div>}>
        <FeeOverridesClient />
      </Suspense>
    </div>
  );
}