import { Suspense } from 'react';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { CustomerRiskClient } from '@/components/admin/customer-risk-client';

export default async function CustomerRiskPage() {
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
        <h1 className="text-3xl font-bold">Customer Risk Signals</h1>
        <p className="text-muted-foreground mt-2">
          Monitor customer behavior patterns and risk indicators
        </p>
      </div>

      <Suspense fallback={<div>Loading customer risk signals...</div>}>
        <CustomerRiskClient />
      </Suspense>
    </div>
  );
}