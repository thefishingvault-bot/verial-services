import { Suspense } from 'react';
import { requireAdmin } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import AuditLogClient from '@/components/admin/audit-log-client';

export default async function AuditLogPage() {
  const admin = await requireAdmin();
  if (!admin.isAdmin) redirect('/dashboard');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Audit Log</h1>
        <p className="text-muted-foreground mt-2">
          Monitor and track all administrative actions and system events for compliance and security.
        </p>
      </div>

      <Suspense fallback={<div>Loading audit log...</div>}>
        <AuditLogClient />
      </Suspense>
    </div>
  );
}