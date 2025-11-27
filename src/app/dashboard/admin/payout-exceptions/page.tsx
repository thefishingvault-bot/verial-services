import { Suspense } from 'react';
import { PayoutExceptionsClient } from '@/components/admin/payout-exceptions-client';

export default function PayoutExceptionsPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Payout Exceptions Review</h1>
        <p className="text-muted-foreground mt-2">
          Review and manage payout exceptions, failed payments, and high-value transactions
        </p>
      </div>

      <Suspense fallback={<div>Loading payout exceptions...</div>}>
        <PayoutExceptionsClient />
      </Suspense>
    </div>
  );
}