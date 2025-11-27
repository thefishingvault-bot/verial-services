import { Suspense } from 'react';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import TemplateManagerClient from '@/components/admin/template-manager-client';

export default async function TemplateManagerPage() {
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
        <h1 className="text-3xl font-bold text-gray-900">Template Manager</h1>
        <p className="text-gray-600 mt-2">
          Create and manage message templates for broadcasts, notifications, and automated communications.
        </p>
      </div>

      <Suspense fallback={<div>Loading template manager...</div>}>
        <TemplateManagerClient />
      </Suspense>
    </div>
  );
}