import { Suspense } from 'react';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

export default async function AdminDashboardPage() {
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

  // Get some quick stats for the dashboard
  const pendingVerifications = await db
    .select()
    .from(users)
    .where(eq(users.role, 'provider'))
    .then(providers => providers.length); // Simplified - in real app would check provider status

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Admin Dashboard</h2>
            <p className="text-gray-600 mt-1">
              Monitor and manage your platform's operations, users, and financial performance.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="secondary" className="px-3 py-1">
              <CheckCircle className="h-4 w-4 mr-1" />
              All Systems Operational
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
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">
              Require admin attention
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue Today</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$2,847</div>
            <p className="text-xs text-muted-foreground">
              +12% from yesterday
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">98.5%</div>
            <p className="text-xs text-muted-foreground">
              All services operational
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
              <Badge variant="secondary">3 pending</Badge>
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
              <Badge variant="secondary">7 pending</Badge>
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
              <Badge variant="secondary">2 pending</Badge>
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
              <Badge variant="destructive">1 active</Badge>
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
              <Badge variant="outline">5 active rules</Badge>
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
              <Badge variant="destructive">12 open</Badge>
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

        <Link href="/dashboard/admin/broadcast">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <MessageSquare className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-lg">Broadcast Messaging</CardTitle>
              </div>
              <CardDescription>
                Send platform-wide announcements.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline">Compose Message</Badge>
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
              <Badge variant="outline">12 templates</Badge>
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
            <div className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div className="flex-1">
                <p className="text-sm font-medium">Provider verification approved</p>
                <p className="text-xs text-muted-foreground">John Smith - Plumbing Services • 2 minutes ago</p>
              </div>
            </div>

            <div className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              <div className="flex-1">
                <p className="text-sm font-medium">Trust incident reported</p>
                <p className="text-xs text-muted-foreground">Booking #BK-1234 • 15 minutes ago</p>
              </div>
            </div>

            <div className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
              <DollarSign className="h-5 w-5 text-blue-600" />
              <div className="flex-1">
                <p className="text-sm font-medium">Revenue milestone reached</p>
                <p className="text-xs text-muted-foreground">$10,000 monthly revenue • 1 hour ago</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}