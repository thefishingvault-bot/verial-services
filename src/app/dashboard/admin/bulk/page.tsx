import { auth, clerkClient } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AdminBulkOperationsFiltersBar } from '@/components/admin/admin-bulk-operations-filters-bar';
import { BulkOperationsClient } from '@/components/admin/bulk-operations-client';
import { AdminBulkSearchSchema, parseSearchParams } from '@/lib/validation/admin-loader-schemas';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

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

  const params = parseSearchParams(AdminBulkSearchSchema, await searchParams);
  const operationType = params.type;
  const statusFilter = params.status;
  const regionFilter = params.region;
  const searchQuery = params.q;

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