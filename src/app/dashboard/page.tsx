'use client';

import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page is now the main dashboard.
// We will redirect providers to their booking list,
// and show customers their dashboard.

export default function DashboardPage() {
  const { user } = useUser();
  const router = useRouter();
  const isProvider = user?.publicMetadata?.role === 'provider';

  useEffect(() => {
    // If the user is a provider, their main dashboard is their booking list.
    if (isProvider) {
      router.replace('/dashboard/bookings/provider');
    }
  }, [isProvider, router]);

  // If they are a customer (or role is loading), show this.
  if (!isProvider) {
    return (
      <div className="max-w-3xl mx-auto p-4 md:p-8">
        <h1 className="text-3xl font-bold mb-6">Welcome, {user?.firstName || 'User'}!</h1>
        <p className="text-muted-foreground">
          This is your main dashboard. You can see your bookings or browse services.
        </p>
        {/* We will add dashboard cards here later */}
      </div>
    );
  }

  // Provider will see a flash of this while redirecting
  return (
    <div className="p-8">
      <p>Loading your provider dashboard...</p>
    </div>
  );
}

