import { db } from "@/lib/db";
import { disputes, bookings, users, providers, services } from "@/db/schema";
import { eq, desc, and, or, ilike, inArray, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AdminDisputesSearchSchema, parseSearchParams } from "@/lib/validation/admin-loader-schemas";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  Filter,
  Search,
  Shield,
  TrendingUp,
  MessageSquare,
  FileText,
  ArrowUpDown
} from "lucide-react";

export const dynamic = "force-dynamic";

function formatSnake(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default async function AdminDisputesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  if (!admin.isAdmin) redirect("/dashboard");

  const params = parseSearchParams(AdminDisputesSearchSchema, await searchParams);
  const statusFilter = params.status;
  const typeFilter = params.type;
  const searchQuery = params.search;
  const activeTab = params.tab;

  const now = new Date();
  const nowMs = now.getTime();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [summary] = await db
    .select({
      totalDisputes: sql<number>`count(*)`,
      openDisputes: sql<number>`count(*) filter (where ${disputes.status} = 'open')`,
      underReviewDisputes: sql<number>`count(*) filter (where ${disputes.status} = 'under_review')`,
      resolvedDisputesAllTime: sql<number>`count(*) filter (where ${disputes.status} = 'resolved')`,
      resolvedDisputesPeriod: sql<number>`count(*) filter (where ${disputes.status} = 'resolved' and ${disputes.resolvedAt} >= ${thirtyDaysAgo})`,
      urgentDisputes: sql<number>`count(*) filter (where ${disputes.status} = 'open' and ${disputes.createdAt} <= ${threeDaysAgo})`,
      totalRefundedCents: sql<number>`coalesce(sum(${disputes.refundAmount}), 0)`,
    })
    .from(disputes);

  // Build where conditions
  const whereConditions = [];

  if (statusFilter !== "all") {
    whereConditions.push(eq(disputes.status, statusFilter));
  }

  if (typeFilter !== "all") {
    whereConditions.push(eq(disputes.initiatorType, typeFilter));
  }

  if (searchQuery) {
    whereConditions.push(
      or(
        ilike(providers.businessName, `%${searchQuery}%`),
        ilike(services.title, `%${searchQuery}%`),
        ilike(disputes.description, `%${searchQuery}%`),
        ilike(disputes.reason, `%${searchQuery}%`)
      )
    );
  }

  // Fetch disputes with booking/provider/service so search works correctly
  const baseDisputes = await db
    .select({
      id: disputes.id,
      reason: disputes.reason,
      description: disputes.description,
      amountDisputed: disputes.amountDisputed,
      status: disputes.status,
      adminDecision: disputes.adminDecision,
      refundAmount: disputes.refundAmount,
      createdAt: disputes.createdAt,
      resolvedAt: disputes.resolvedAt,
      initiatorType: disputes.initiatorType,
      bookingId: disputes.bookingId,
      initiatorId: disputes.initiatorId,
      bookingStatus: bookings.status,
      bookingTotalAmount: bookings.priceAtBooking,
      bookingScheduledAt: bookings.scheduledDate,
      bookingCustomerId: bookings.userId,
      service: {
        id: services.id,
        name: services.title,
      },
      provider: {
        id: providers.id,
        businessName: providers.businessName,
        handle: providers.handle,
      },
    })
    .from(disputes)
    .innerJoin(bookings, eq(disputes.bookingId, bookings.id))
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .innerJoin(providers, eq(bookings.providerId, providers.id))
    .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
    .orderBy(desc(disputes.createdAt))
    .limit(100);

  const initiatorIds = [...new Set(baseDisputes.map((d) => d.initiatorId))];
  const customerIds = [...new Set(baseDisputes.map((d) => d.bookingCustomerId))];
  const userIds = [...new Set([...initiatorIds, ...customerIds])];

  const userRows = userIds.length
    ? await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        })
        .from(users)
        .where(inArray(users.id, userIds))
    : [];

  const usersById = new Map(userRows.map((u) => [u.id, u] as const));

  // Combine the data
  const disputeList = baseDisputes.map((dispute) => {
    const initiator = usersById.get(dispute.initiatorId);
    const customer = usersById.get(dispute.bookingCustomerId);

    return {
      id: dispute.id,
      reason: dispute.reason,
      description: dispute.description,
      amountDisputed: dispute.amountDisputed,
      status: dispute.status,
      adminDecision: dispute.adminDecision,
      refundAmount: dispute.refundAmount,
      createdAt: dispute.createdAt,
      resolvedAt: dispute.resolvedAt,
      initiatorType: dispute.initiatorType,
      bookingId: dispute.bookingId,
      initiatorId: dispute.initiatorId,
      booking: {
        id: dispute.bookingId,
        status: dispute.bookingStatus,
        totalAmount: dispute.bookingTotalAmount,
        scheduledAt: dispute.bookingScheduledAt,
        service: dispute.service,
      },
      provider: dispute.provider,
      initiator: {
        id: initiator?.id ?? dispute.initiatorId,
        firstName: initiator?.firstName ?? null,
        lastName: initiator?.lastName ?? null,
        email: initiator?.email ?? "",
      },
      customer: {
        id: customer?.id ?? dispute.bookingCustomerId,
        firstName: customer?.firstName ?? null,
        lastName: customer?.lastName ?? null,
        email: customer?.email ?? "",
      },
    };
  });

  const totalDisputes = summary?.totalDisputes ?? 0;
  const openDisputes = summary?.openDisputes ?? 0;
  const underReviewDisputes = summary?.underReviewDisputes ?? 0;
  const resolvedDisputesAllTime = summary?.resolvedDisputesAllTime ?? 0;
  const resolvedDisputesPeriod = summary?.resolvedDisputesPeriod ?? 0;
  const urgentDisputes = summary?.urgentDisputes ?? 0;
  const totalRefunded = summary?.totalRefundedCents ?? 0;

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dispute Management</h1>
            <p className="text-muted-foreground mt-2">
              Review and resolve booking disputes between customers and providers.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link
              href={`/api/admin/disputes/export?status=${encodeURIComponent(statusFilter)}&type=${encodeURIComponent(typeFilter)}&search=${encodeURIComponent(searchQuery ?? "")}`}
            >
              <FileText className="mr-2 h-4 w-4" />
              Export Report
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/admin/templates">
              <MessageSquare className="mr-2 h-4 w-4" />
              Templates
            </Link>
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Disputes</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDisputes}</div>
            <p className="text-xs text-muted-foreground">
              All time
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{openDisputes}</div>
            <p className="text-xs text-muted-foreground">
              {urgentDisputes} urgent
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Under Review</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{underReviewDisputes}</div>
            <p className="text-xs text-muted-foreground">
              In progress
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{resolvedDisputesPeriod}</div>
            <p className="text-xs text-muted-foreground">
              This period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Refunded</CardTitle>
            <DollarSign className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">${(totalRefunded / 100).toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">
              In refunds
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolution Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {totalDisputes > 0 ? Math.round((resolvedDisputesAllTime / totalDisputes) * 100) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              Success rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Urgent Disputes Alert */}
      {urgentDisputes > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>{urgentDisputes} urgent dispute{urgentDisputes > 1 ? 's' : ''}</strong> require immediate attention (open for more than 3 days).
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <Tabs defaultValue={activeTab} className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TabsList>
            <TabsTrigger value="all">All Disputes</TabsTrigger>
            <TabsTrigger value="open">Open ({openDisputes})</TabsTrigger>
            <TabsTrigger value="under_review">Under Review ({underReviewDisputes})</TabsTrigger>
            <TabsTrigger value="resolved">Resolved ({resolvedDisputesAllTime})</TabsTrigger>
          </TabsList>

          {/* Advanced Filters */}
          <form method="GET" className="flex flex-col sm:flex-row sm:items-center gap-2 w-full lg:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                name="search"
                placeholder="Search disputes..."
                className="pl-9"
                defaultValue={searchQuery}
              />
            </div>
            <select
              name="status"
              defaultValue={statusFilter}
              className="border-input dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-32 md:text-sm"
            >
              <option value="all">All Status</option>
              <option value="open">Open</option>
              <option value="under_review">Under Review</option>
              <option value="resolved">Resolved</option>
            </select>
            <select
              name="type"
              defaultValue={typeFilter}
              className="border-input dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-32 md:text-sm"
            >
              <option value="all">All Types</option>
              <option value="customer">Customer</option>
              <option value="provider">Provider</option>
            </select>
            <Button type="submit" variant="outline" size="sm" className="w-full sm:w-auto">
              <Filter className="h-4 w-4 mr-2" />
              More Filters
            </Button>
          </form>
        </div>

        <TabsContent value="all" className="space-y-4">
          <DisputesTable disputes={disputeList} nowMs={nowMs} />
        </TabsContent>

        <TabsContent value="open" className="space-y-4">
          <DisputesTable disputes={disputeList.filter(d => d.status === "open")} nowMs={nowMs} />
        </TabsContent>

        <TabsContent value="under_review" className="space-y-4">
          <DisputesTable disputes={disputeList.filter(d => d.status === "under_review")} nowMs={nowMs} />
        </TabsContent>

        <TabsContent value="resolved" className="space-y-4">
          <DisputesTable disputes={disputeList.filter(d => d.status === "resolved")} nowMs={nowMs} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Separate component for the disputes table
function DisputesTable({
  disputes,
  nowMs,
}: {
  disputes: Array<{
    id: string;
    reason: string;
    description: string | null;
    amountDisputed: number | null;
    status: string;
    adminDecision: string | null;
    refundAmount: number | null;
    createdAt: Date;
    resolvedAt: Date | null;
    initiatorType: string;
    bookingId: string;
    initiatorId: string;
    booking: {
      id: string;
      status: string;
      totalAmount: number;
      scheduledAt: Date | null;
      service: { id: string; name: string };
    };
    provider: {
      id: string;
      businessName: string;
      handle: string;
    };
    initiator: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
    };
    customer: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
    };
  }>;
  nowMs: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Disputes</CardTitle>
        <CardDescription>
          Manage and resolve customer and provider disputes
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="hidden lg:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <div className="flex items-center gap-2">
                    Booking
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead>Initiator</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {disputes.map((dispute) => {
                const daysSinceCreation = (nowMs - dispute.createdAt.getTime()) / (1000 * 60 * 60 * 24);
                const isUrgent = dispute.status === "open" && daysSinceCreation > 3;
                const isHighPriority = dispute.amountDisputed && dispute.amountDisputed > 5000; // $50+
                return (
                  <TableRow key={dispute.id} className={isUrgent ? "bg-red-50" : ""}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{dispute.booking.service.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {dispute.provider.businessName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {dispute.booking.scheduledAt ?
                            dispute.booking.scheduledAt.toLocaleDateString() :
                            "Not scheduled"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">
                          {dispute.initiator.firstName} {dispute.initiator.lastName}
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {dispute.initiatorType}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium capitalize">
                          {formatSnake(dispute.reason)}
                        </div>
                        <div className="text-sm text-muted-foreground line-clamp-2">
                          {dispute.description}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {dispute.amountDisputed ? (
                          <div className="font-medium">
                            ${(dispute.amountDisputed / 100).toFixed(2)}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                        {dispute.refundAmount && (
                          <div className="text-sm text-green-600">
                            Refunded: ${(dispute.refundAmount / 100).toFixed(2)}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        dispute.status === "open" ? "destructive" :
                        dispute.status === "under_review" ? "secondary" :
                        dispute.status === "resolved" ? "default" :
                        "outline"
                      }>
                        {formatSnake(dispute.status)}
                      </Badge>
                      {dispute.adminDecision && (
                        <div className="text-xs text-muted-foreground mt-1 capitalize">
                          {formatSnake(dispute.adminDecision)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {isUrgent && (
                          <Badge variant="destructive" className="text-xs">
                            Urgent
                          </Badge>
                        )}
                        {isHighPriority && (
                          <Badge variant="secondary" className="text-xs">
                            High Value
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {dispute.createdAt.toLocaleDateString()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {Math.floor(daysSinceCreation)}d ago
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {dispute.status === "open" && (
                          <form action={`/api/admin/disputes/${dispute.id}/review`} method="POST" className="inline">
                            <Button type="submit" size="sm" variant="outline">
                              Start Review
                            </Button>
                          </form>
                        )}
                        {dispute.status === "under_review" && (
                          <Button asChild size="sm">
                            <Link href={`/dashboard/admin/disputes/${dispute.id}`}>
                              Resolve
                            </Link>
                          </Button>
                        )}
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/dashboard/admin/bookings?bookingId=${dispute.booking.id}`}>
                            View Booking
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {disputes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No disputes found matching the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Cards */}
        <div className="grid gap-3 lg:hidden">
          {disputes.map((dispute) => {
            const daysSinceCreation = (nowMs - dispute.createdAt.getTime()) / (1000 * 60 * 60 * 24);
            const isUrgent = dispute.status === "open" && daysSinceCreation > 3;
            const isHighPriority = dispute.amountDisputed && dispute.amountDisputed > 5000;
            return (
              <Card key={dispute.id} className={isUrgent ? "border-red-200 bg-red-50" : undefined}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{dispute.booking.service.name}</p>
                      <p className="text-sm text-muted-foreground">{dispute.provider.businessName}</p>
                      <p className="text-xs text-muted-foreground">
                        {dispute.booking.scheduledAt ? dispute.booking.scheduledAt.toLocaleDateString() : "Not scheduled"}
                      </p>
                    </div>
                    <Badge variant={
                      dispute.status === "open" ? "destructive" :
                      dispute.status === "under_review" ? "secondary" :
                      dispute.status === "resolved" ? "default" :
                      "outline"
                    }>
                      {formatSnake(dispute.status)}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">Initiator</p>
                      <p className="font-medium">{dispute.initiator.firstName} {dispute.initiator.lastName}</p>
                      <Badge variant="outline" className="text-xs mt-1 capitalize">{dispute.initiatorType}</Badge>
                    </div>
                    <div className="text-right">
                      <p className="text-muted-foreground">Amount</p>
                      <p className="font-semibold">
                        {dispute.amountDisputed ? `$${(dispute.amountDisputed / 100).toFixed(2)}` : 'N/A'}
                      </p>
                      {dispute.refundAmount && (
                        <p className="text-xs text-green-600">Refunded ${(dispute.refundAmount / 100).toFixed(2)}</p>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground line-clamp-2">{dispute.description}</p>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex gap-2">
                      {isUrgent && <Badge variant="destructive" className="text-[10px]">Urgent</Badge>}
                      {isHighPriority && <Badge variant="secondary" className="text-[10px]">High Value</Badge>}
                    </div>
                    <span>{Math.floor(daysSinceCreation)}d ago</span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {dispute.status === "open" && (
                      <form action={`/api/admin/disputes/${dispute.id}/review`} method="POST" className="inline">
                        <Button type="submit" size="sm" variant="outline" className="w-full sm:w-auto">
                          Start Review
                        </Button>
                      </form>
                    )}
                    {dispute.status === "under_review" && (
                      <Button asChild size="sm" className="w-full sm:w-auto">
                        <Link href={`/dashboard/admin/disputes/${dispute.id}`}>
                          Resolve
                        </Link>
                      </Button>
                    )}
                    <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
                      <Link href={`/dashboard/admin/bookings?bookingId=${dispute.booking.id}`}>
                        View Booking
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {disputes.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">No disputes found matching the current filters.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}