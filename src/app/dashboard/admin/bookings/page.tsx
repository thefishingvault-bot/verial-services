import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { bookings, users, providers, services } from "@/db/schema";
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
  ArrowUpDown,
  MoreHorizontal
} from "lucide-react";

interface SearchParams {
  status?: string;
  search?: string;
  tab?: string;
}

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
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

  const params = await searchParams;
  const statusFilter = params.status || "all";
  const searchQuery = params.search || "";
  const activeTab = params.tab || "all";

  // Build where conditions
  const whereConditions = [];

  if (statusFilter !== "all") {
    whereConditions.push(eq(bookings.status, statusFilter as "pending" | "confirmed" | "paid" | "completed" | "canceled"));
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
  const confirmedBookings = bookingsData.filter(b => b.status === "confirmed").length;
  const paidBookings = bookingsData.filter(b => b.status === "paid").length;
  const completedBookings = bookingsData.filter(b => b.status === "completed").length;
  const canceledBookings = bookingsData.filter(b => b.status === "canceled").length;
  const totalRevenue = bookingsData
    .filter(b => b.status === "paid" || b.status === "completed")
    .reduce((sum, b) => sum + (b.priceAtBooking || 0), 0);

  // Calculate recent bookings (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
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
        <div className="flex justify-between items-center">
          <TabsList>
            <TabsTrigger value="all">All Bookings ({totalBookings})</TabsTrigger>
            <TabsTrigger value="pending">Pending ({pendingBookings})</TabsTrigger>
            <TabsTrigger value="confirmed">Confirmed ({confirmedBookings})</TabsTrigger>
            <TabsTrigger value="paid">Paid ({paidBookings})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({completedBookings})</TabsTrigger>
            <TabsTrigger value="canceled">Canceled ({canceledBookings})</TabsTrigger>
          </TabsList>

          {/* Advanced Filters */}
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search bookings..."
                className="pl-9 w-64"
                defaultValue={searchQuery}
              />
            </div>
            <Select defaultValue={statusFilter}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="canceled">Canceled</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm">
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
          <BookingsTable bookings={bookingsData.filter(b => b.status === "confirmed")} />
        </TabsContent>

        <TabsContent value="paid" className="space-y-4">
          <BookingsTable bookings={bookingsData.filter(b => b.status === "paid")} />
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <BookingsTable bookings={bookingsData.filter(b => b.status === "completed")} />
        </TabsContent>

        <TabsContent value="canceled" className="space-y-4">
          <BookingsTable bookings={bookingsData.filter(b => b.status === "canceled")} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Separate component for the bookings table
function BookingsTable({ bookings }: { bookings: any[] }) {
  // ...existing code...
  // Move Date.now() outside render
  const now = Date.now();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bookings</CardTitle>
        <CardDescription>
          Manage and monitor all platform bookings
        </CardDescription>
      </CardHeader>
      <CardContent>
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
              const daysSinceCreation = (now - booking.createdAt.getTime()) / (1000 * 60 * 60 * 24);
              const isRecent = daysSinceCreation < 1; // Less than 24 hours
              // ...existing code...
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
                        <Badge variant="outline" className="text-xs text-green-600">
                          Paid
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={
                      booking.status === "pending" ? "secondary" :
                      booking.status === "confirmed" ? "default" :
                      booking.status === "paid" ? "default" :
                      booking.status === "completed" ? "default" :
                      booking.status === "canceled" ? "destructive" :
                      "outline"
                    }>
                      {booking.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {booking.scheduledDate ?
                        booking.scheduledDate.toLocaleDateString() :
                        "Not scheduled"}
                    </div>
                    {booking.scheduledDate && (
                      <div className="text-xs text-muted-foreground">
                        {booking.scheduledDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {booking.createdAt.toLocaleDateString()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {Math.floor(daysSinceCreation)}d ago
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/dashboard/admin/bookings/${booking.id}`}>
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Link>
                      </Button>
                      {booking.status === "pending" && (
                        <Button size="sm" variant="outline">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      )}
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
      </CardContent>
    </Card>
  );
}