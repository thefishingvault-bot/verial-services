import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { assertAdminOrThrow } from '@/lib/admin-auth';
import {
  disputes,
  messageTemplates,
  providerChanges,
  providerEarnings,
  providers,
  riskRules,
  trustIncidents,
  providerSuspensions,
} from '@/db/schema';
import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import {
  Shield,
  Users,
  FileCheck,
  AlertTriangle,
  Ban,
  TrendingUp,
  Settings,
  MessageSquare,
  Search,
  DollarSign,
  Activity,
  CheckCircle,
  Clock,
  AlertCircle
} from 'lucide-react';

const formatCurrencyNZD = (cents: number) =>
  new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(
    cents / 100,
  );

function formatTimeAgo(date: Date): string {
  const now = Date.now();
  const diffMs = Math.max(0, now - date.getTime());

  const minutes = Math.floor(diffMs / (60 * 1000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function AdminDashboardPage() {
  const admin = await assertAdminOrThrow().catch((res) => {
    if (res instanceof Response) notFound();
    throw res;
  });

  void admin;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  const [
    pendingVerificationsRow,
    activeDisputesRow,
    platformFeesTodayRow,
    openTrustIncidentsRow,
    pendingProfileChangesRow,
    kycPendingRow,
    suspendedProvidersRow,
    activeRiskRulesRow,
    templatesRow,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(providers)
      .where(eq(providers.status, 'pending')),
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(disputes)
      .where(inArray(disputes.status, ['open', 'under_review'])),
    db
      .select({
        cents: sql<number>`cast(coalesce(sum(${providerEarnings.platformFeeAmount}), 0) as int)`,
      })
      .from(providerEarnings)
      .where(
        and(
          gte(providerEarnings.paidAt, startOfToday),
          lt(providerEarnings.paidAt, startOfTomorrow),
          inArray(providerEarnings.status, ['awaiting_payout', 'paid_out']),
        ),
      ),
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(trustIncidents)
      .where(eq(trustIncidents.resolved, false)),
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(providerChanges)
      .where(eq(providerChanges.status, 'pending')),
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(providers)
      .where(eq(providers.kycStatus, 'pending_review')),
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(providers)
      .where(eq(providers.isSuspended, true)),
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(riskRules)
      .where(eq(riskRules.enabled, true)),
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(messageTemplates),
  ]);

  const pendingVerifications = pendingVerificationsRow[0]?.count ?? 0;
  const activeDisputes = activeDisputesRow[0]?.count ?? 0;
  const platformFeesTodayCents = platformFeesTodayRow[0]?.cents ?? 0;
  const openTrustIncidents = openTrustIncidentsRow[0]?.count ?? 0;
  const pendingProfileChanges = pendingProfileChangesRow[0]?.count ?? 0;
  const pendingKyc = kycPendingRow[0]?.count ?? 0;
  const suspendedProviders = suspendedProvidersRow[0]?.count ?? 0;
  const activeRiskRules = activeRiskRulesRow[0]?.count ?? 0;
  const templatesCount = templatesRow[0]?.count ?? 0;

  const [recentDisputes, recentTrustIncidents, recentProfileChanges, recentSuspensions] =
    await Promise.all([
      db
        .select({
          id: disputes.id,
          status: disputes.status,
          bookingId: disputes.bookingId,
          createdAt: disputes.createdAt,
        })
        .from(disputes)
        .orderBy(desc(disputes.createdAt))
        .limit(5),
      db
        .select({
          id: trustIncidents.id,
          incidentType: trustIncidents.incidentType,
          severity: trustIncidents.severity,
          createdAt: trustIncidents.createdAt,
        })
        .from(trustIncidents)
        .orderBy(desc(trustIncidents.createdAt))
        .limit(5),
      db
        .select({
          id: providerChanges.id,
          fieldName: providerChanges.fieldName,
          status: providerChanges.status,
          createdAt: providerChanges.createdAt,
        })
        .from(providerChanges)
        .orderBy(desc(providerChanges.createdAt))
        .limit(5),
      db
        .select({
          id: providerSuspensions.id,
          action: providerSuspensions.action,
          createdAt: providerSuspensions.createdAt,
        })
        .from(providerSuspensions)
        .orderBy(desc(providerSuspensions.createdAt))
        .limit(5),
    ]);

  const recentActivity = [
    ...recentDisputes.map((row) => ({
      key: `dispute:${row.id}`,
      createdAt: row.createdAt,
      icon: AlertTriangle,
      title: `Dispute ${row.status.replace('_', ' ')}`,
      subtitle: `Booking ${row.bookingId}`,
    })),
    ...recentTrustIncidents.map((row) => ({
      key: `trust:${row.id}`,
      createdAt: row.createdAt,
      icon: AlertCircle,
      title: `Trust incident reported` ,
      subtitle: `${row.incidentType} • ${row.severity}`,
    })),
    ...recentProfileChanges.map((row) => ({
      key: `change:${row.id}`,
      createdAt: row.createdAt,
      icon: Users,
      title: `Provider profile change ${row.status}`,
      subtitle: `Field: ${row.fieldName}`,
    })),
    ...recentSuspensions.map((row) => ({
      key: `suspension:${row.id}`,
      createdAt: row.createdAt,
      icon: Ban,
      title: `Provider ${row.action}`,
      subtitle: `Suspension action logged`,
    })),
  ]
    .filter((item) => item.createdAt instanceof Date)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 6);

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Admin Dashboard</h2>
            <p className="text-muted-foreground mt-1">
              Monitor and manage your platform&apos;s operations, users, and financial performance.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="px-3 py-1">
              <CheckCircle className="h-4 w-4 mr-1" />
              Live data
            </Badge>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Verifications</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingVerifications}</div>
            <p className="text-xs text-muted-foreground">
              Providers awaiting approval
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Disputes</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeDisputes}</div>
            <p className="text-xs text-muted-foreground">
              Require admin attention
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Platform Fees Today</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrencyNZD(platformFeesTodayCents)}</div>
            <p className="text-xs text-muted-foreground">
              Fees collected from paid bookings
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Trust Incidents</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openTrustIncidents}</div>
            <p className="text-xs text-muted-foreground">
              Unresolved incidents needing review
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Admin Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {/* Provider Management */}
        <Link href="/dashboard/admin/verifications">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <FileCheck className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-lg">Provider Verifications</CardTitle>
              </div>
              <CardDescription>
                Approve or reject new providers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant={pendingVerifications > 0 ? 'secondary' : 'outline'}>
                {pendingVerifications} pending
              </Badge>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/admin/providers/health">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Activity className="h-5 w-5 text-green-600" />
                <CardTitle className="text-lg">Provider Health</CardTitle>
              </div>
              <CardDescription>
                Monitor provider performance and risks.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline">View Dashboard</Badge>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/admin/providers/changes">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-purple-600" />
                <CardTitle className="text-lg">Profile Changes</CardTitle>
              </div>
              <CardDescription>
                Review and approve provider updates.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant={pendingProfileChanges > 0 ? 'secondary' : 'outline'}>
                {pendingProfileChanges} pending
              </Badge>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/admin/providers/kyc">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Shield className="h-5 w-5 text-indigo-600" />
                <CardTitle className="text-lg">KYC Status</CardTitle>
              </div>
              <CardDescription>
                Manage identity verification.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant={pendingKyc > 0 ? 'secondary' : 'outline'}>
                {pendingKyc} pending
              </Badge>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/admin/providers/suspension">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Ban className="h-5 w-5 text-red-600" />
                <CardTitle className="text-lg">Suspensions</CardTitle>
              </div>
              <CardDescription>
                Manage provider suspensions and limits.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant={suspendedProviders > 0 ? 'destructive' : 'outline'}>
                {suspendedProviders} active
              </Badge>
            </CardContent>
          </Card>
        </Link>

        {/* Trust & Risk Management */}
        <Link href="/dashboard/admin/trust">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                <CardTitle className="text-lg">Trust & Risk</CardTitle>
              </div>
              <CardDescription>
                Monitor incidents and trust scores.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline">View Incidents</Badge>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/admin/trust/rules">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Settings className="h-5 w-5 text-gray-600" />
                <CardTitle className="text-lg">Risk Rules</CardTitle>
              </div>
              <CardDescription>
                Configure trust scoring parameters.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline">{activeRiskRules} active rules</Badge>
            </CardContent>
          </Card>
        </Link>

        {/* Dispute & Booking Management */}
        <Link href="/dashboard/admin/disputes">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <MessageSquare className="h-5 w-5 text-yellow-600" />
                <CardTitle className="text-lg">Dispute Triage</CardTitle>
              </div>
              <CardDescription>
                Review and resolve booking disputes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant={activeDisputes > 0 ? 'destructive' : 'outline'}>
                {activeDisputes} open
              </Badge>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/admin/bookings">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Search className="h-5 w-5 text-cyan-600" />
                <CardTitle className="text-lg">Booking Management</CardTitle>
              </div>
              <CardDescription>
                Search and manage all bookings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline">Advanced Search</Badge>
            </CardContent>
          </Card>
        </Link>

        {/* Financial Management */}
        <Link href="/dashboard/admin/fees">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                <CardTitle className="text-lg">Fees & Revenue</CardTitle>
              </div>
              <CardDescription>
                View platform revenue and export CSVs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline">View Analytics</Badge>
            </CardContent>
          </Card>
        </Link>

        {/* Additional Admin Tools */}
        <Link href="/dashboard/admin/bulk">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Settings className="h-5 w-5 text-slate-600" />
                <CardTitle className="text-lg">Bulk Operations</CardTitle>
              </div>
              <CardDescription>
                Perform batch operations efficiently.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline">Tools Available</Badge>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/admin/provider-communications">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <MessageSquare className="h-5 w-5 text-teal-600" />
                <CardTitle className="text-lg">Provider Communications</CardTitle>
              </div>
              <CardDescription>
                Send bulk messages and manage provider communications.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline">Communication Tools</Badge>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/admin/waitlist">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-lg">Waitlist</CardTitle>
              </div>
              <CardDescription>
                View waitlist signups.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline">View List</Badge>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/admin/templates">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <FileCheck className="h-5 w-5 text-purple-600" />
                <CardTitle className="text-lg">Template Manager</CardTitle>
              </div>
              <CardDescription>
                Manage message templates.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline">
                {templatesCount} {templatesCount === 1 ? 'template' : 'templates'}
              </Badge>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/admin/audit">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Shield className="h-5 w-5 text-red-600" />
                <CardTitle className="text-lg">Audit Log</CardTitle>
              </div>
              <CardDescription>
                Monitor admin actions and security.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline">View Events</Badge>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent Activity Section */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest admin actions and system events</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentActivity.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No recent events yet.
              </div>
            ) : (
              recentActivity.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.key}
                    className="flex items-center space-x-4 rounded-lg border bg-card p-3"
                  >
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.subtitle} • {formatTimeAgo(item.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}