import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { disputes, bookings, users, providers, services } from "@/db/schema";
import { eq, desc, and, or, like, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

export default async function AdminDisputesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await currentUser();
  if (!user?.id) {
    redirect("/dashboard");
  }

  try {
    await requireAdmin(user.id);
  } catch {
    redirect("/dashboard");
  }

  const params = parseSearchParams(AdminDisputesSearchSchema, await searchParams);
  const statusFilter = params.status;
  const typeFilter = params.type;
  const searchQuery = params.search;
  const activeTab = params.tab;

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
        like(providers.businessName, `%${searchQuery}%`),
        like(disputes.description, `%${searchQuery}%`),
        like(disputes.reason, `%${searchQuery}%`)
      )
    );
  }

  // Fetch disputes with related data using separate queries to avoid complex joins
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
    })
    .from(disputes)
    .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
    .orderBy(desc(disputes.createdAt))
    .limit(100);

  // Get all related data in separate queries
  const bookingIds = [...new Set(baseDisputes.map(d => d.bookingId))];
  const initiatorIds = [...new Set(baseDisputes.map(d => d.initiatorId))];

  const bookingsData = bookingIds.length > 0 ? await db
    .select({
      id: bookings.id,
      status: bookings.status,
      totalAmount: bookings.priceAtBooking,
      scheduledAt: bookings.scheduledDate,
      serviceId: bookings.serviceId,
      providerId: bookings.providerId,
      userId: bookings.userId,
    })
    .from(bookings)
    .where(inArray(bookings.id, bookingIds)) : [];

  const servicesData = bookingsData.length > 0 ? await db
    .select({
      id: services.id,
      name: services.title,
    })
    .from(services)
    .where(inArray(services.id, bookingsData.map(b => b.serviceId))) : [];

  const providersData = bookingsData.length > 0 ? await db
    .select({
      id: providers.id,
      businessName: providers.businessName,
      handle: providers.handle,
    })
    .from(providers)
    .where(inArray(providers.id, bookingsData.map(b => b.providerId))) : [];

  const initiatorsData = initiatorIds.length > 0 ? await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(inArray(users.id, initiatorIds)) : [];

  const customerIds = [...new Set(bookingsData.map(b => b.userId))];
  const customersData = customerIds.length > 0 ? await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(inArray(users.id, customerIds)) : [];

  // Combine the data
  const disputeList = baseDisputes.map(dispute => {
    const booking = bookingsData.find(b => b.id === dispute.bookingId);
    const service = booking ? servicesData.find(s => s.id === booking.serviceId) : null;
    const provider = booking ? providersData.find(p => p.id === booking.providerId) : null;
    const initiator = initiatorsData.find(i => i.id === dispute.initiatorId);
    const customer = booking ? customersData.find(c => c.id === booking.userId) : null;

    return {
      ...dispute,
      booking: booking ? {
        ...booking,
        service: service || { id: '', name: '' },
      } : { id: '', status: 'pending' as const, totalAmount: 0, scheduledAt: null, service: { id: '', name: '' } },
      provider: provider || { id: '', businessName: '', handle: '' },
      initiator: initiator || { id: '', firstName: null, lastName: null, email: '' },
      customer: customer || { id: '', firstName: null, lastName: null, email: '' },
    };
  });

  // Get summary stats
  const totalDisputes = disputeList.length;
  const openDisputes = disputeList.filter(d => d.status === "open").length;
  const underReviewDisputes = disputeList.filter(d => d.status === "under_review").length;
  const resolvedDisputes = disputeList.filter(d => d.status === "resolved").length;
  const totalRefunded = disputeList
    .filter(d => d.refundAmount)
    .reduce((sum, d) => sum + (d.refundAmount || 0), 0);

  // Calculate urgency based on days open (using createdAt only)
  function getUrgentDisputes(list: typeof disputeList) {
    return list.filter(d => {
      const daysSinceCreation = (new Date().getTime() - d.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      return d.status === "open" && daysSinceCreation > 3;
    }).length;
  }
  const urgentDisputes = getUrgentDisputes(disputeList);

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
          <Button variant="outline">
            <FileText className="mr-2 h-4 w-4" />
            Export Report
          </Button>
          <Button variant="outline">
            <MessageSquare className="mr-2 h-4 w-4" />
            Templates
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
            <div className="text-2xl font-bold text-green-600">{resolvedDisputes}</div>
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
              {totalDisputes > 0 ? Math.round((resolvedDisputes / totalDisputes) * 100) : 0}%
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
            <TabsTrigger value="review">Under Review ({underReviewDisputes})</TabsTrigger>
            <TabsTrigger value="resolved">Resolved ({resolvedDisputes})</TabsTrigger>
          </TabsList>

          {/* Advanced Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full lg:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search disputes..."
                className="pl-9"
                defaultValue={searchQuery}
              />
            </div>
            <Select defaultValue={statusFilter}>
              <SelectTrigger className="w-full sm:w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue={typeFilter}>
              <SelectTrigger className="w-full sm:w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="provider">Provider</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="w-full sm:w-auto">
              <Filter className="h-4 w-4 mr-2" />
              More Filters
            </Button>
          </div>
        </div>

        <TabsContent value="all" className="space-y-4">
          <DisputesTable disputes={disputeList} />
        </TabsContent>

        <TabsContent value="open" className="space-y-4">
          <DisputesTable disputes={disputeList.filter(d => d.status === "open")} />
        </TabsContent>

        <TabsContent value="review" className="space-y-4">
          <DisputesTable disputes={disputeList.filter(d => d.status === "under_review")} />
        </TabsContent>

        <TabsContent value="resolved" className="space-y-4">
          <DisputesTable disputes={disputeList.filter(d => d.status === "resolved")} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Separate component for the disputes table
function DisputesTable({
  disputes,
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
                const daysSinceCreation = (new Date().getTime() - dispute.createdAt.getTime()) / (1000 * 60 * 60 * 24);
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
                          {dispute.reason.replace("_", " ")}
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
                        {dispute.status.replace("_", " ")}
                      </Badge>
                      {dispute.adminDecision && (
                        <div className="text-xs text-muted-foreground mt-1 capitalize">
                          {dispute.adminDecision.replace("_", " ")}
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
            const daysSinceCreation = (new Date().getTime() - dispute.createdAt.getTime()) / (1000 * 60 * 60 * 24);
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
                      {dispute.status.replace("_", " ")}
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