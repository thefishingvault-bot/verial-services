import { auth, clerkClient } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AdminBulkOperationsFiltersBar } from '@/components/admin/admin-bulk-operations-filters-bar';
import { BulkOperationsClient } from '@/components/admin/bulk-operations-client';

type SearchParams = Promise<{
  type?: 'providers' | 'bookings';
  status?: string;
  region?: string;
  q?: string;
}>;

export default async function AdminBulkOperationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect('/dashboard');
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const role = user.publicMetadata.role;

  if (role !== 'admin') {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const operationType = params.type ?? 'providers';
  const statusFilter = params.status ?? 'all';
  const regionFilter = params.region ?? 'all';
  const searchQuery = params.q ?? '';

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Admin · Bulk Operations</h1>
          <p className="text-muted-foreground">
            Perform actions on multiple {operationType} at once
          </p>
        </div>
      </div>

      <Suspense>
        <AdminBulkOperationsFiltersBar
          operationType={operationType}
          searchParams={{ status: statusFilter, region: regionFilter, q: searchQuery }}
        />
      </Suspense>

      <BulkOperationsClient
        operationType={operationType}
        filters={{ status: statusFilter, region: regionFilter, q: searchQuery }}
      />
    </div>
  );
}