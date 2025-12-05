"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Calendar, User, Package, Briefcase, CreditCard, Settings, Clock, Shield, AlertTriangle, BarChart3, FileText, Gavel, Banknote } from "lucide-react";
import { ProviderAnalyticsCardClient } from "@/components/dashboard/provider-analytics-card.client";
import { ProviderThisWeekCardClient } from "@/components/dashboard/provider-this-week-card.client";
import { ProviderReviewsCardClient } from "@/components/dashboard/provider-reviews-card.client";
import { ProviderServicePerformanceCardClient } from "@/components/dashboard/provider-service-performance-card.client";
import { ProviderPayoutsSummaryCardClient } from "@/components/dashboard/provider-payouts-summary-card.client";
import { ProviderConnectBanner } from "@/components/dashboard/provider-connect-banner";

export default function DashboardPage() {
  const { user } = useUser();
  const isProvider = user?.publicMetadata?.role === "provider";
  const isAdmin = user?.publicMetadata?.role === "admin";

  // --- Admin Dashboard ---
  if (isAdmin) {
    return (
      <div className="container max-w-6xl mx-auto p-4 md:p-8">
        <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>
        <p className="text-muted-foreground mb-8">
          Manage providers, monitor platform health, and handle disputes.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Provider Management */}
          <Link href="/dashboard/admin/verifications">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>Provider Verifications</CardTitle>
                  <CardDescription>Approve or reject new providers.</CardDescription>
                </div>
                <Shield className="h-8 w-8 text-muted-foreground" />
              </CardHeader>
            </Card>
          </Link>

          <Link href="/dashboard/admin/providers/health">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>Provider Health</CardTitle>
                  <CardDescription>Monitor provider performance and risks.</CardDescription>
                </div>
                <BarChart3 className="h-8 w-8 text-muted-foreground" />
              </CardHeader>
            </Card>
          </Link>

          <Link href="/dashboard/admin/providers/changes">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>Profile Changes</CardTitle>
                  <CardDescription>Review and approve provider updates.</CardDescription>
                </div>
                <FileText className="h-8 w-8 text-muted-foreground" />
              </CardHeader>
            </Card>
          </Link>

          <Link href="/dashboard/admin/providers/kyc">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>KYC Status</CardTitle>
                  <CardDescription>Manage identity verification.</CardDescription>
                </div>
                <User className="h-8 w-8 text-muted-foreground" />
              </CardHeader>
            </Card>
          </Link>

          <Link href="/dashboard/admin/providers/suspension">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>Suspensions</CardTitle>
                  <CardDescription>Manage provider suspensions and limits.</CardDescription>
                </div>
                <AlertTriangle className="h-8 w-8 text-muted-foreground" />
              </CardHeader>
            </Card>
          </Link>

          {/* Trust & Risk */}
          <Link href="/dashboard/admin/trust">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>Trust & Risk</CardTitle>
                  <CardDescription>Monitor incidents and trust scores.</CardDescription>
                </div>
                <Shield className="h-8 w-8 text-muted-foreground" />
              </CardHeader>
            </Card>
          </Link>

          <Link href="/dashboard/admin/trust/rules">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>Risk Rules</CardTitle>
                  <CardDescription>Configure trust scoring parameters.</CardDescription>
                </div>
                <Settings className="h-8 w-8 text-muted-foreground" />
              </CardHeader>
            </Card>
          </Link>

          {/* Disputes */}
          <Link href="/dashboard/admin/disputes">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>Dispute Triage</CardTitle>
                  <CardDescription>Review and resolve booking disputes.</CardDescription>
                </div>
                <Gavel className="h-8 w-8 text-muted-foreground" />
              </CardHeader>
            </Card>
          </Link>

          {/* Bookings & Operations */}
          <Link href="/dashboard/admin/bookings">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>Booking Management</CardTitle>
                  <CardDescription>Search and manage all bookings.</CardDescription>
                </div>
                <Calendar className="h-8 w-8 text-muted-foreground" />
              </CardHeader>
            </Card>
          </Link>

          {/* Finance */}
          <Link href="/dashboard/admin/payments">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>Manage Payments</CardTitle>
                  <CardDescription>Monitor charges, refunds, and payouts.</CardDescription>
                </div>
                <Banknote className="h-8 w-8 text-muted-foreground" />
              </CardHeader>
            </Card>
          </Link>

          <Link href="/dashboard/admin/fees">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>Fees & Revenue</CardTitle>
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

        <div className="mb-6">
          <ProviderConnectBanner />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <ProviderAnalyticsCardClient />
          <ProviderThisWeekCardClient />
          <ProviderReviewsCardClient />
          <ProviderServicePerformanceCardClient />
          <ProviderPayoutsSummaryCardClient />
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
      </div>
    </div>
  );
}

