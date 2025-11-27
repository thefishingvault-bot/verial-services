import { Suspense } from 'react';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { RebookToolClient } from '@/components/admin/rebook-tool-client';

export default async function RebookToolPage() {
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

  if (!user[0] || user[0].role !== 'admin') {
    redirect('/dashboard');
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Admin Rebook Tool</h1>
        <p className="text-muted-foreground mt-2">
          Rebook cancelled services for customers with new dates and times
        </p>
      </div>

      <Suspense fallback={<div>Loading rebook tool...</div>}>
        <RebookToolClient />
      </Suspense>
    </div>
  );
}