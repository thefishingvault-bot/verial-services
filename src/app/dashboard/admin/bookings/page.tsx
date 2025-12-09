import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { bookings, users, providers, services, bookingStatusEnum } from "@/db/schema";
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
import {
  Calendar,
  CheckCircle,
  Clock,
  DollarSign,
  Eye,
  Filter,
  Search,
  Users,
  TrendingUp,
  ArrowUpDown
} from "lucide-react";
import { AdminBookingsSearchSchema, parseSearchParams } from "@/lib/validation/admin-loader-schemas";

type BookingStatusValue = (typeof bookingStatusEnum.enumValues)[number];

export default async function AdminBookingsPage({
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

  const params = parseSearchParams(AdminBookingsSearchSchema, await searchParams);
  const statusFilter = params.status;
  const searchQuery = params.search;
  const activeTab = params.tab;

  // Build where conditions
  const whereConditions = [];

  const canceledStatuses: BookingStatusValue[] = ["canceled_customer", "canceled_provider"];

  if (statusFilter === "canceled") {
    whereConditions.push(inArray(bookings.status, canceledStatuses));
  } else {
    const normalizedStatus = statusFilter;
    if (
      normalizedStatus !== "all" &&
      normalizedStatus &&
      bookingStatusEnum.enumValues.includes(normalizedStatus as BookingStatusValue)
    ) {
      whereConditions.push(eq(bookings.status, normalizedStatus as BookingStatusValue));
    }
  }

  if (searchQuery) {
    whereConditions.push(
      or(
        like(bookings.id, `%${searchQuery}%`),
        like(users.firstName, `%${searchQuery}%`),
        like(users.lastName, `%${searchQuery}%`),
        like(users.email, `%${searchQuery}%`),
        like(providers.businessName, `%${searchQuery}%`),
        like(services.title, `%${searchQuery}%`)
      )
    );
  }

  // Fetch bookings with related data using joins
  const bookingsData = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      scheduledDate: bookings.scheduledDate,
      priceAtBooking: bookings.priceAtBooking,
      paymentIntentId: bookings.paymentIntentId,
      createdAt: bookings.createdAt,
      updatedAt: bookings.updatedAt,
      userId: bookings.userId,
      providerId: bookings.providerId,
      serviceId: bookings.serviceId,
      // Customer info
      customerFirstName: users.firstName,
      customerLastName: users.lastName,
      customerEmail: users.email,
      // Provider info
      providerBusinessName: providers.businessName,
      providerHandle: providers.handle,
      // Service info
      serviceTitle: services.title,
    })
    .from(bookings)
    .leftJoin(users, eq(bookings.userId, users.id))
    .leftJoin(providers, eq(bookings.providerId, providers.id))
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
    .orderBy(desc(bookings.createdAt))
    .limit(100);

  // Get summary stats
  const totalBookings = bookingsData.length;
  const pendingBookings = bookingsData.filter(b => b.status === "pending").length;
  const confirmedBookings = bookingsData.filter(b => b.status === "accepted").length;
  const paidBookings = bookingsData.filter(b => b.status === "paid").length;
  const completedBookings = bookingsData.filter(b => b.status === "completed").length;
  const canceledBookings = bookingsData.filter(
    b => b.status === "canceled_customer" || b.status === "canceled_provider",
  ).length;
  const totalRevenue = bookingsData
    .filter(b => b.status === "paid" || b.status === "completed")
    .reduce((sum, b) => sum + (b.priceAtBooking || 0), 0);

  // Calculate recent bookings (last 7 days)
  const sevenDaysAgo = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000);
  const recentBookings = bookingsData.filter(b => b.createdAt >= sevenDaysAgo).length;

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Booking Management</h1>
            <p className="text-muted-foreground mt-2">
              Monitor and manage all bookings across the platform.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Calendar className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalBookings}</div>
            <p className="text-xs text-muted-foreground">
              All time
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{pendingBookings}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting confirmation
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Confirmed</CardTitle>
            <CheckCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{confirmedBookings}</div>
            <p className="text-xs text-muted-foreground">
              Ready to proceed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{paidBookings}</div>
            <p className="text-xs text-muted-foreground">
              Payment received
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">${(totalRevenue / 100).toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">
              From completed bookings
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
            <Calendar className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{recentBookings}</div>
            <p className="text-xs text-muted-foreground">
              Last 7 days
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue={activeTab} className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TabsList>
            <TabsTrigger value="all">All Bookings ({totalBookings})</TabsTrigger>
            <TabsTrigger value="pending">Pending ({pendingBookings})</TabsTrigger>
            <TabsTrigger value="confirmed">Accepted ({confirmedBookings})</TabsTrigger>
            <TabsTrigger value="paid">Paid ({paidBookings})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({completedBookings})</TabsTrigger>
            <TabsTrigger value="canceled">Canceled ({canceledBookings})</TabsTrigger>
          </TabsList>

          {/* Advanced Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full lg:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search bookings..."
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
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="confirmed">Accepted</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="canceled">Canceled</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="w-full sm:w-auto">
              <Filter className="h-4 w-4 mr-2" />
              More Filters
            </Button>
          </div>
        </div>

        <TabsContent value="all" className="space-y-4">
          <BookingsTable bookings={bookingsData} />
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          <BookingsTable bookings={bookingsData.filter(b => b.status === "pending")} />
        </TabsContent>

        <TabsContent value="confirmed" className="space-y-4">
          <BookingsTable bookings={bookingsData.filter(b => b.status === "accepted")} />
        </TabsContent>

        <TabsContent value="paid" className="space-y-4">
          <BookingsTable bookings={bookingsData.filter(b => b.status === "paid")} />
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <BookingsTable bookings={bookingsData.filter(b => b.status === "completed")} />
        </TabsContent>

        <TabsContent value="canceled" className="space-y-4">
          <BookingsTable bookings={bookingsData.filter(b => canceledStatuses.includes(b.status))} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
// Separate component for the bookings table
function BookingsTable({
  bookings,
}: {
  bookings: Array<{
    id: string;
    status: BookingStatusValue;
    scheduledDate: Date | null;
    priceAtBooking: number;
    paymentIntentId: string | null;
    createdAt: Date;
    updatedAt: Date;
    userId: string | null;
    providerId: string | null;
    serviceId: string | null;
    customerFirstName: string | null;
    customerLastName: string | null;
    customerEmail: string | null;
    providerBusinessName: string | null;
    providerHandle: string | null;
    serviceTitle: string | null;
  }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bookings</CardTitle>
        <CardDescription>
          Manage and monitor all platform bookings
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="hidden lg:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <div className="flex items-center gap-2">
                    Booking ID
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scheduled Date</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map((booking) => {
                const daysSinceCreation = (new Date().getTime() - booking.createdAt.getTime()) / (1000 * 60 * 60 * 24);
                const isRecent = daysSinceCreation < 1; // Less than 24 hours
                return (
                  <TableRow key={booking.id} className={isRecent ? "bg-blue-50" : ""}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium font-mono text-sm">{booking.id}</div>
                        {booking.paymentIntentId && (
                          <div className="text-xs text-muted-foreground">
                            PI: {booking.paymentIntentId.substring(0, 20)}...
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">
                          {booking.customerFirstName} {booking.customerLastName}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {booking.customerEmail}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{booking.providerBusinessName}</div>
                        <div className="text-sm text-muted-foreground">
                          @{booking.providerHandle}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{booking.serviceTitle}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">
                          ${(booking.priceAtBooking / 100).toFixed(2)}
                        </div>
                        {booking.status === "paid" && (
                          <div className="text-xs text-green-600">Paid</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          booking.status === "accepted"
                            ? "default"
                            : booking.status === "pending"
                            ? "secondary"
                            : booking.status === "paid"
                            ? "default"
                            : booking.status === "completed"
                            ? "default"
                            : booking.status?.startsWith("canceled")
                            ? "destructive"
                            : booking.status === "declined"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {booking.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {booking.scheduledDate ? new Date(booking.scheduledDate).toLocaleDateString() : "TBD"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {new Date(booking.createdAt).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/dashboard/admin/bookings/${booking.id}`}>
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {bookings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No bookings found matching the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Cards */}
        <div className="grid gap-3 lg:hidden">
          {bookings.map((booking) => {
            const daysSinceCreation = (new Date().getTime() - booking.createdAt.getTime()) / (1000 * 60 * 60 * 24);
            const isRecent = daysSinceCreation < 1;
            return (
              <Card key={booking.id} className={isRecent ? "border-blue-200 bg-blue-50" : undefined}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-mono text-xs text-muted-foreground">{booking.id}</div>
                      <div className="font-semibold">{booking.serviceTitle}</div>
                      <div className="text-xs text-muted-foreground">@{booking.providerHandle}</div>
                    </div>
                    <Badge
                      variant={
                        booking.status === "accepted"
                          ? "default"
                          : booking.status === "pending"
                          ? "secondary"
                          : booking.status === "paid"
                          ? "default"
                          : booking.status === "completed"
                          ? "default"
                          : booking.status?.startsWith("canceled")
                          ? "destructive"
                          : booking.status === "declined"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {booking.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">Customer</p>
                      <p className="font-medium">{booking.customerFirstName} {booking.customerLastName}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{booking.customerEmail}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-muted-foreground">Amount</p>
                      <p className="font-semibold">${(booking.priceAtBooking / 100).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">
                        {booking.scheduledDate ? new Date(booking.scheduledDate).toLocaleDateString() : "TBD"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Created {new Date(booking.createdAt).toLocaleDateString()}</span>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/dashboard/admin/bookings/${booking.id}`}>
                        View
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {bookings.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">No bookings found matching the current filters.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
