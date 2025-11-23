"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Search,
  Calendar,
  User,
  Package,
  Briefcase,
  CreditCard,
  Settings,
  Clock,
} from "lucide-react";
import { FavoriteProvidersCard } from "@/components/favorites/favorite-providers-card";

export default function DashboardPage() {
  const { user } = useUser();
  const isProvider = user?.publicMetadata?.role === "provider";
  const isAdmin = user?.publicMetadata?.role === "admin";

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

  // --- Provider Dashboard (Command Center) ---
  if (isProvider) {
    return (
      <div className="container max-w-5xl mx-auto p-4 md:p-8">
        <h1 className="text-3xl font-bold mb-6">Provider Dashboard</h1>
        <p className="text-muted-foreground mb-8">
          Manage your business, bookings, and availability.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link href="/dashboard/bookings/provider">
            <Card className="hover:shadow-lg transition-shadow h-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>Manage Bookings</CardTitle>
                  <CardDescription>View and act on new requests.</CardDescription>
                </div>
                <Briefcase className="h-8 w-8 text-primary" />
              </CardHeader>
            </Card>
          </Link>

          <Link href="/dashboard/availability">
            <Card className="hover:shadow-lg transition-shadow h-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>Availability</CardTitle>
                  <CardDescription>Set your weekly hours and time off.</CardDescription>
                </div>
                <Clock className="h-8 w-8 text-primary" />
              </CardHeader>
            </Card>
          </Link>

          <Link href="/dashboard/services">
            <Card className="hover:shadow-lg transition-shadow h-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>My Services</CardTitle>
                  <CardDescription>Create, edit, or remove listings.</CardDescription>
                </div>
                <Package className="h-8 w-8 text-primary" />
              </CardHeader>
            </Card>
          </Link>

          <Link href="/dashboard/messages">
            <Card className="hover:shadow-lg transition-shadow h-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>Messages</CardTitle>
                  <CardDescription>Chat with your customers.</CardDescription>
                </div>
                <User className="h-8 w-8 text-primary" />
              </CardHeader>
            </Card>
          </Link>

          <Link href="/dashboard/payouts">
            <Card className="hover:shadow-lg transition-shadow h-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>Payouts</CardTitle>
                  <CardDescription>View earnings and bank transfers.</CardDescription>
                </div>
                <CreditCard className="h-8 w-8 text-primary" />
              </CardHeader>
            </Card>
          </Link>

          <Link href="/dashboard/profile">
            <Card className="hover:shadow-lg transition-shadow h-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>Profile</CardTitle>
                  <CardDescription>Update your bio, avatar, and name.</CardDescription>
                </div>
                <User className="h-8 w-8 text-primary" />
              </CardHeader>
            </Card>
          </Link>

          <Link href="/dashboard/settings">
            <Card className="hover:shadow-lg transition-shadow h-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>Settings</CardTitle>
                  <CardDescription>Manage GST and other preferences.</CardDescription>
                </div>
                <Settings className="h-8 w-8 text-primary" />
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>
    );
  }

  // --- Customer Dashboard ---
  return (
    <div className="container max-w-5xl mx-auto p-4 md:p-8">
      <h1 className="text-3xl font-bold mb-6">Welcome, {user?.firstName || "User"}!</h1>
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
        <Link href="/dashboard/messages">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="space-y-1">
                <CardTitle>Messages</CardTitle>
                <CardDescription>Chat with your providers.</CardDescription>
              </div>
              <User className="h-8 w-8 text-muted-foreground" />
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
        <FavoriteProvidersCard />
      </div>
    </div>
  );
}

