'use client';

import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Calendar, User, Briefcase, CreditCard, Settings } from 'lucide-react';
import { Loader2 } from 'lucide-react';

// This page is the main dashboard.
// We will redirect providers to their booking list,
// and show customers their dashboard.

export default function DashboardPage() {
  const { user } = useUser();
  const router = useRouter();
  const isProvider = user?.publicMetadata?.role === 'provider';
  const isAdmin = user?.publicMetadata?.role === 'admin';

  useEffect(() => {
    // If the user is a provider, their main dashboard is their booking list.
    if (isProvider && !isAdmin) { // Admins might want to see the main dash
      router.replace('/dashboard/bookings/provider');
    }
    // If user is admin, they stay here
    // If user is customer, they stay here
  }, [isProvider, isAdmin, router]);

  // --- Admin Dashboard ---
  if (isAdmin) {
    return (
      <div className="container max-w-5xl mx-auto p-4 md:p-8">
        <h1 className="text-3xl font-bold mb-6">Welcome, Admin!</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link href="/dashboard/admin/verifications">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>Provider Verifications</CardTitle>
                  <CardDescription>Approve or reject new providers.</CardDescription>
                </div>
                <User className="h-8 w-8 text-muted-foreground" />
              </CardHeader>
            </Card>
          </Link>
          <Link href="/dashboard/admin/fees">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>Fees Report</CardTitle>
                  <CardDescription>View platform revenue and export CSVs.</CardDescription>
                </div>
                <CreditCard className="h-8 w-8 text-muted-foreground" />
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>
    );
  }

  // --- Provider Loading State ---
  if (isProvider && !isAdmin) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="ml-2 text-muted-foreground">Loading your provider dashboard...</p>
      </div>
    );
  }

  // --- Customer Dashboard ---
  return (
    <div className="container max-w-5xl mx-auto p-4 md:p-8">
      <h1 className="text-3xl font-bold mb-6">Welcome, {user?.firstName || 'User'}!</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href="/services">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="space-y-1">
                <CardTitle>Browse Services</CardTitle>
                <CardDescription>Find and book a local provider.</CardDescription>
              </div>
              <Search className="h-8 w-8 text-muted-foreground" />
            </CardHeader>
          </Card>
        </Link>
        <Link href="/dashboard/bookings">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="space-y-1">
                <CardTitle>My Bookings</CardTitle>
                <CardDescription>View your booking history and status.</CardDescription>
              </div>
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </CardHeader>
          </Card>
        </Link>
        <Link href="/dashboard/register-provider">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="space-y-1">
                <CardTitle>Become a Provider</CardTitle>
                <CardDescription>List your own services and get paid.</CardDescription>
              </div>
              <Briefcase className="h-8 w-8 text-muted-foreground" />
            </CardHeader>
          </Card>
        </Link>
        <Link href="/dashboard/settings">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="space-y-1">
                <CardTitle>Settings</CardTitle>
                <CardDescription>Manage your account and preferences.</CardDescription>
              </div>
              <Settings className="h-8 w-8 text-muted-foreground" />
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}

