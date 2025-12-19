import { Suspense } from 'react';
import { requireAdmin } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import TemplateManagerClient from '@/components/admin/template-manager-client';

export default async function TemplateManagerPage() {
  const admin = await requireAdmin();
  if (!admin.isAdmin) redirect('/dashboard');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Template Manager</h1>
        <p className="text-muted-foreground mt-2">
          Create and manage message templates for broadcasts, notifications, and automated communications.
        </p>
      </div>

      <Suspense fallback={<div>Loading template manager...</div>}>
        <TemplateManagerClient />
      </Suspense>
    </div>
  );
}