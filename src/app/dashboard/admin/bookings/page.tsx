import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { bookings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import AdminBookingsFiltersBar from "@/components/admin/admin-bookings-filters-bar";

// TODO: Replace with actual role check utility if needed
type ClerkUser = { publicMetadata?: { role?: string } };
function isAdmin(user: ClerkUser | null | undefined): boolean {
  return user?.publicMetadata?.role === "admin";
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await currentUser();
  if (!isAdmin(user)) {
    redirect("/dashboard");
  }

  const params = await searchParams;

  // Extract filters from searchParams
  const bookingId = params?.bookingId ?? "";
  const status = params?.status ?? "";
  const userId = params?.userId ?? "";
  const providerId = params?.providerId ?? "";
  // const date = params?.date ?? ""; // TODO: Implement date filter

  // Build query (simple version, expand as needed)
  const conditions = [];
  if (bookingId) conditions.push(eq(bookings.id, bookingId));
  if (status) conditions.push(eq(bookings.status, status as "pending" | "confirmed" | "paid" | "completed" | "canceled"));
  if (userId) conditions.push(eq(bookings.userId, userId));
  if (providerId) conditions.push(eq(bookings.providerId, providerId));
  // Date filter can be added here

  const results = await db
    .select()
    .from(bookings)
    .where(conditions.length ? and(...conditions) : undefined);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin: Global Booking Search</h1>
      <AdminBookingsFiltersBar />
      {/* Table of bookings */}
      <table className="w-full border mt-4">
        <thead>
          <tr>
            <th>ID</th>
            <th>User</th>
            <th>Provider</th>
            <th>Status</th>
            <th>Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {results.map((booking) => (
            <tr key={booking.id}>
              <td>{booking.id}</td>
              <td>{booking.userId}</td>
              <td>{booking.providerId}</td>
              <td>{booking.status}</td>
              <td>{booking.scheduledDate ? booking.scheduledDate.toString() : "-"}</td>
              <td>
                {/* Drilldown link (to be implemented) */}
                <a href={`/dashboard/admin/bookings/${booking.id}`}>View</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}