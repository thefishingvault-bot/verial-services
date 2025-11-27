import { Suspense } from 'react';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import AuditLogClient from '@/components/admin/audit-log-client';

export default async function AuditLogPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  // Check if user is admin
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user[0]?.role?.includes('admin')) {
    redirect('/dashboard');
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Admin Audit Log</h1>
        <p className="text-gray-600 mt-2">
          Monitor and track all administrative actions and system events for compliance and security.
        </p>
      </div>

      <Suspense fallback={<div>Loading audit log...</div>}>
        <AuditLogClient />
      </Suspense>
    </div>
  );
}