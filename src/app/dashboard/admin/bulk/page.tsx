import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AdminBulkOperationsFiltersBar } from '@/components/admin/admin-bulk-operations-filters-bar';
import { BulkOperationsClient } from '@/components/admin/bulk-operations-client';
import { AdminBulkSearchSchema, parseSearchParams } from '@/lib/validation/admin-loader-schemas';
import { requireAdmin } from '@/lib/admin-auth';
import { db } from '@/lib/db';
import { services } from '@/db/schema';
import { asc, isNotNull } from 'drizzle-orm';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = 'force-dynamic';

export default async function AdminBulkOperationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const admin = await requireAdmin();
  if (!admin.isAdmin) redirect('/dashboard');

  const params = parseSearchParams(AdminBulkSearchSchema, await searchParams);
  const operationType = params.type;
  const statusFilter = params.status;
  const regionFilter = params.region;
  const searchQuery = params.q;
  const page = params.page;
  const pageSize = params.pageSize;

  const regionOptions =
    operationType === 'providers'
      ? (
          await db
            .select({ region: services.region })
            .from(services)
            .where(isNotNull(services.region))
            .groupBy(services.region)
            .orderBy(asc(services.region))
        )
          .map((r) => r.region)
          .filter((r): r is string => Boolean(r))
      : [];

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
          searchParams={{ status: statusFilter, region: regionFilter, q: searchQuery, page, pageSize }}
          regionOptions={regionOptions}
        />
      </Suspense>

      <BulkOperationsClient
        operationType={operationType}
        filters={{ status: statusFilter, region: regionFilter, q: searchQuery, page, pageSize }}
      />
    </div>
  );
}