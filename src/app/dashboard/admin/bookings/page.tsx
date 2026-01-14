import { db } from "@/lib/db";
import { bookings, users, providers, services, bookingStatusEnum } from "@/db/schema";
import { eq, desc, asc, and, or, ilike, inArray, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar,
  CheckCircle,
  Clock,
  DollarSign,
  Eye,
  Filter,
  Users,
  TrendingUp,
  ArrowUpDown
} from "lucide-react";
import { AdminBookingsSearchSchema, parseSearchParams } from "@/lib/validation/admin-loader-schemas";
import { computeBookingsListControls } from "@/lib/admin/bookings-list-controls";

type BookingStatusValue = (typeof bookingStatusEnum.enumValues)[number];

export const dynamic = "force-dynamic";

function buildSearchHref(current: {
  status: string;
  search: string;
  tab: string;
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: string;
}, overrides: Partial<Record<string, string | number | undefined>>) {
  const sp = new URLSearchParams();

  const merged: Record<string, string> = {
    status: String(overrides.status ?? current.status),
    search: String(overrides.search ?? current.search ?? ""),
    tab: String(overrides.tab ?? current.tab),
    page: String(overrides.page ?? current.page),
    pageSize: String(overrides.pageSize ?? current.pageSize),
    sortBy: String(overrides.sortBy ?? current.sortBy),
    sortDir: String(overrides.sortDir ?? current.sortDir),
  };

  for (const [k, v] of Object.entries(merged)) {
    if (v === "" && k === "search") continue;
    sp.set(k, v);
  }

  return `/dashboard/admin/bookings?${sp.toString()}`;
}

function nextSortDir(currentSortBy: string, currentSortDir: string, targetSortBy: string) {
  if (currentSortBy === targetSortBy) return currentSortDir === "asc" ? "desc" : "asc";
  if (targetSortBy === "createdAt") return "desc";
  return "asc";
}

function formatBookingStatus(status: string) {
  if (status === "canceled_customer") return "Canceled (Customer)";
  if (status === "canceled_provider") return "Canceled (Provider)";
  return status
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  if (!admin.isAdmin) redirect("/dashboard");

  const params = parseSearchParams(AdminBookingsSearchSchema, await searchParams);
  const statusFilter = params.status;
  const searchQuery = params.search;
  const { page, pageSize, offset, limit, sortBy, sortDir } = computeBookingsListControls({
    page: params.page,
    pageSize: params.pageSize,
    sortBy: params.sortBy,
    sortDir: params.sortDir,
  });
  const canceledStatuses: BookingStatusValue[] = ["canceled_customer", "canceled_provider"];

  const activeTab =
    statusFilter === "pending"
      ? "pending"
      : statusFilter === "accepted"
        ? "confirmed"
        : statusFilter === "paid"
          ? "paid"
          : statusFilter === "completed"
            ? "completed"
            : statusFilter === "canceled" || canceledStatuses.includes(statusFilter as BookingStatusValue)
              ? "canceled"
              : "all";

  const now = new Date();
  const nowMs = now.getTime();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [summary] = await db
    .select({
      totalBookings: sql<number>`count(*)`,
      pendingBookings: sql<number>`count(*) filter (where ${bookings.status} = 'pending')`,
      acceptedBookings: sql<number>`count(*) filter (where ${bookings.status} = 'accepted')`,
      paidBookings: sql<number>`count(*) filter (where ${bookings.status} = 'paid')`,
      completedBookings: sql<number>`count(*) filter (where ${bookings.status} = 'completed')`,
      canceledBookings: sql<number>`count(*) filter (where ${bookings.status} in ('canceled_customer','canceled_provider'))`,
      recentBookings: sql<number>`count(*) filter (where ${bookings.createdAt} >= ${sevenDaysAgo})`,
      totalRevenueCents: sql<number>`coalesce(sum(${bookings.priceAtBooking}) filter (where ${bookings.status} in ('paid','completed')), 0)`,
    })
    .from(bookings);

  // Build where conditions
  const whereConditions = [];

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
        ilike(bookings.id, `%${searchQuery}%`),
        ilike(users.firstName, `%${searchQuery}%`),
        ilike(users.lastName, `%${searchQuery}%`),
        ilike(users.email, `%${searchQuery}%`),
        ilike(providers.businessName, `%${searchQuery}%`),
        ilike(providers.handle, `%${searchQuery}%`),
        ilike(services.title, `%${searchQuery}%`)
      )
    );
  }

  const where = whereConditions.length > 0 ? and(...whereConditions) : undefined;

  const [{ totalCount } = { totalCount: 0 }] = await db
    .select({ totalCount: sql<number>`count(distinct ${bookings.id})` })
    .from(bookings)
    .leftJoin(users, eq(bookings.userId, users.id))
    .leftJoin(providers, eq(bookings.providerId, providers.id))
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .where(where);

  const totalPages = Math.max(1, Math.ceil(Number(totalCount || 0) / pageSize));
  if (page > totalPages) {
    redirect(
      buildSearchHref(
        {
          status: statusFilter,
          search: searchQuery,
          tab: params.tab,
          page,
          pageSize,
          sortBy,
          sortDir,
        },
        { page: totalPages },
      ),
    );
  }

  const orderByExpr = (() => {
    const dir = sortDir === "asc" ? asc : desc;
    switch (sortBy) {
      case "amount":
        return dir(bookings.priceAtBooking);
      case "status":
        return dir(bookings.status);
      case "scheduledAt":
        return dir(bookings.scheduledDate);
      case "id":
        return dir(bookings.id);
      case "createdAt":
      default:
        return dir(bookings.createdAt);
    }
  })();

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
    .where(where)
    .orderBy(orderByExpr)
    .limit(limit)
    .offset(offset);

  const totalBookings = summary?.totalBookings ?? 0;
  const pendingBookings = summary?.pendingBookings ?? 0;
  const confirmedBookings = summary?.acceptedBookings ?? 0;
  const paidBookings = summary?.paidBookings ?? 0;
  const completedBookings = summary?.completedBookings ?? 0;
  const canceledBookings = summary?.canceledBookings ?? 0;
  const recentBookings = summary?.recentBookings ?? 0;
  const totalRevenue = summary?.totalRevenueCents ?? 0;

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
          <Button asChild variant="outline">
            <Link
              href={`/api/admin/bookings/export?status=${encodeURIComponent(statusFilter)}&search=${encodeURIComponent(searchQuery ?? "")}&sortBy=${encodeURIComponent(sortBy)}&sortDir=${encodeURIComponent(sortDir)}`}
            >
              <Calendar className="mr-2 h-4 w-4" />
              Export Report
            </Link>
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
      <Tabs value={activeTab} className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TabsList>
            <TabsTrigger
              value="all"
              asChild
            >
              <Link href={buildSearchHref({ status: statusFilter, search: searchQuery, tab: params.tab, page, pageSize, sortBy, sortDir }, { status: "all", page: 1 })}>
                All Bookings ({totalBookings})
              </Link>
            </TabsTrigger>
            <TabsTrigger value="pending" asChild>
              <Link href={buildSearchHref({ status: statusFilter, search: searchQuery, tab: params.tab, page, pageSize, sortBy, sortDir }, { status: "pending", page: 1 })}>
                Pending ({pendingBookings})
              </Link>
            </TabsTrigger>
            <TabsTrigger value="confirmed" asChild>
              <Link href={buildSearchHref({ status: statusFilter, search: searchQuery, tab: params.tab, page, pageSize, sortBy, sortDir }, { status: "accepted", page: 1 })}>
                Accepted ({confirmedBookings})
              </Link>
            </TabsTrigger>
            <TabsTrigger value="paid" asChild>
              <Link href={buildSearchHref({ status: statusFilter, search: searchQuery, tab: params.tab, page, pageSize, sortBy, sortDir }, { status: "paid", page: 1 })}>
                Paid ({paidBookings})
              </Link>
            </TabsTrigger>
            <TabsTrigger value="completed" asChild>
              <Link href={buildSearchHref({ status: statusFilter, search: searchQuery, tab: params.tab, page, pageSize, sortBy, sortDir }, { status: "completed", page: 1 })}>
                Completed ({completedBookings})
              </Link>
            </TabsTrigger>
            <TabsTrigger value="canceled" asChild>
              <Link href={buildSearchHref({ status: statusFilter, search: searchQuery, tab: params.tab, page, pageSize, sortBy, sortDir }, { status: "canceled", page: 1 })}>
                Canceled ({canceledBookings})
              </Link>
            </TabsTrigger>
          </TabsList>

          {/* Advanced Filters */}
          <form method="GET" className="flex flex-col sm:flex-row sm:items-center gap-2 w-full lg:w-auto">
            <input type="hidden" name="page" value="1" />
            <input type="hidden" name="pageSize" value={pageSize} />
            <input type="hidden" name="sortBy" value={sortBy} />
            <input type="hidden" name="sortDir" value={sortDir} />
            <div className="w-full sm:w-64">
              <Input name="search" placeholder="Search bookings..." defaultValue={searchQuery} />
            </div>
            <select
              name="status"
              defaultValue={statusFilter}
              className="border-input dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-40 md:text-sm"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="paid">Paid</option>
              <option value="completed">Completed</option>
              <option value="canceled">Canceled</option>
            </select>
            <Button type="submit" variant="outline" size="sm" className="w-full sm:w-auto">
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
          </form>
        </div>

        <TabsContent value="all" className="space-y-4">
          <BookingsTable
            bookings={bookingsData}
            nowMs={nowMs}
            totalCount={Number(totalCount || 0)}
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            makeHref={(overrides) =>
              buildSearchHref(
                { status: statusFilter, search: searchQuery, tab: params.tab, page, pageSize, sortBy, sortDir },
                overrides,
              )
            }
            sortBy={sortBy}
            sortDir={sortDir}
          />
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          <BookingsTable
            bookings={bookingsData}
            nowMs={nowMs}
            totalCount={Number(totalCount || 0)}
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            makeHref={(overrides) =>
              buildSearchHref(
                { status: statusFilter, search: searchQuery, tab: params.tab, page, pageSize, sortBy, sortDir },
                overrides,
              )
            }
            sortBy={sortBy}
            sortDir={sortDir}
          />
        </TabsContent>

        <TabsContent value="confirmed" className="space-y-4">
          <BookingsTable
            bookings={bookingsData}
            nowMs={nowMs}
            totalCount={Number(totalCount || 0)}
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            makeHref={(overrides) =>
              buildSearchHref(
                { status: statusFilter, search: searchQuery, tab: params.tab, page, pageSize, sortBy, sortDir },
                overrides,
              )
            }
            sortBy={sortBy}
            sortDir={sortDir}
          />
        </TabsContent>

        <TabsContent value="paid" className="space-y-4">
          <BookingsTable
            bookings={bookingsData}
            nowMs={nowMs}
            totalCount={Number(totalCount || 0)}
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            makeHref={(overrides) =>
              buildSearchHref(
                { status: statusFilter, search: searchQuery, tab: params.tab, page, pageSize, sortBy, sortDir },
                overrides,
              )
            }
            sortBy={sortBy}
            sortDir={sortDir}
          />
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <BookingsTable
            bookings={bookingsData}
            nowMs={nowMs}
            totalCount={Number(totalCount || 0)}
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            makeHref={(overrides) =>
              buildSearchHref(
                { status: statusFilter, search: searchQuery, tab: params.tab, page, pageSize, sortBy, sortDir },
                overrides,
              )
            }
            sortBy={sortBy}
            sortDir={sortDir}
          />
        </TabsContent>

        <TabsContent value="canceled" className="space-y-4">
          <BookingsTable
            bookings={bookingsData}
            nowMs={nowMs}
            totalCount={Number(totalCount || 0)}
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            makeHref={(overrides) =>
              buildSearchHref(
                { status: statusFilter, search: searchQuery, tab: params.tab, page, pageSize, sortBy, sortDir },
                overrides,
              )
            }
            sortBy={sortBy}
            sortDir={sortDir}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
// Separate component for the bookings table
function BookingsTable({
  bookings,
  nowMs,
  totalCount,
  page,
  totalPages,
  pageSize,
  makeHref,
  sortBy,
  sortDir,
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
  nowMs: number;
  totalCount: number;
  page: number;
  totalPages: number;
  pageSize: number;
  makeHref: (overrides: Partial<Record<string, string | number | undefined>>) => string;
  sortBy: string;
  sortDir: string;
}) {
  const canPrev = page > 1;
  const canNext = page < totalPages;
  const showingFrom = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(totalCount, (page - 1) * pageSize + bookings.length);

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
                  <Link
                    href={makeHref({
                      sortBy: "id",
                      sortDir: nextSortDir(sortBy, sortDir, "id"),
                      page: 1,
                    })}
                    className="flex items-center gap-2 hover:underline"
                  >
                    Booking ID
                    <ArrowUpDown className="h-4 w-4" />
                  </Link>
                </TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>
                  <Link
                    href={makeHref({
                      sortBy: "amount",
                      sortDir: nextSortDir(sortBy, sortDir, "amount"),
                      page: 1,
                    })}
                    className="flex items-center gap-2 hover:underline"
                  >
                    Amount
                    <ArrowUpDown className="h-4 w-4" />
                  </Link>
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scheduled Date</TableHead>
                <TableHead>
                  <Link
                    href={makeHref({
                      sortBy: "createdAt",
                      sortDir: nextSortDir(sortBy, sortDir, "createdAt"),
                      page: 1,
                    })}
                    className="flex items-center gap-2 hover:underline"
                  >
                    Created
                    <ArrowUpDown className="h-4 w-4" />
                  </Link>
                </TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map((booking) => {
                const daysSinceCreation = (nowMs - booking.createdAt.getTime()) / (1000 * 60 * 60 * 24);
                const isRecent = daysSinceCreation < 1; // Less than 24 hours
                return (
                  <TableRow key={booking.id} className={isRecent ? "bg-muted/30" : ""}>
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
                        {formatBookingStatus(booking.status)}
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
            const daysSinceCreation = (nowMs - booking.createdAt.getTime()) / (1000 * 60 * 60 * 24);
            const isRecent = daysSinceCreation < 1;
            return (
              <Card key={booking.id} className={isRecent ? "bg-muted/30" : undefined}>
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
                      {formatBookingStatus(booking.status)}
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

        <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {totalCount === 0
              ? "No results"
              : `Showing ${showingFrom}-${showingTo} of ${totalCount}`}
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" disabled={!canPrev}>
              <Link href={makeHref({ page: page - 1 })} aria-disabled={!canPrev}>
                Prev
              </Link>
            </Button>
            <div className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </div>
            <Button asChild variant="outline" size="sm" disabled={!canNext}>
              <Link href={makeHref({ page: page + 1 })} aria-disabled={!canNext}>
                Next
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
