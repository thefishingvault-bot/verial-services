import { Suspense } from 'react';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import BroadcastMessagingClient from '@/components/admin/broadcast-messaging-client';

export default async function BroadcastMessagingPage() {
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
        <h1 className="text-3xl font-bold text-gray-900">Broadcast Messaging</h1>
        <p className="text-gray-600 mt-2">
          Send messages to users across the platform. Monitor delivery and engagement metrics.
        </p>
      </div>

      <Suspense fallback={<div>Loading broadcast messaging dashboard...</div>}>
        <BroadcastMessagingClient />
      </Suspense>
    </div>
  );
}