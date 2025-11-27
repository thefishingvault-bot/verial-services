import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { disputes, bookings, users, providers, services } from "@/db/schema";
import { eq, desc, and, or, like, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";

// TODO: Replace with actual role check utility if needed
type ClerkUser = { publicMetadata?: { role?: string } };
function isAdmin(user: ClerkUser | null | undefined): boolean {
  return user?.publicMetadata?.role === "admin";
}

interface SearchParams {
  status?: string;
  type?: string;
  search?: string;
}

export default async function AdminDisputesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await currentUser();
  if (!isAdmin(user)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const statusFilter = params.status || "all";
  const typeFilter = params.type || "all";
  const searchQuery = params.search || "";

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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Admin: Dispute Triage</h1>
          <p className="text-gray-600">
            Review and resolve booking disputes between customers and providers.
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-gray-900">{totalDisputes}</div>
          <div className="text-sm text-gray-600">Total Disputes</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-red-600">{openDisputes}</div>
          <div className="text-sm text-gray-600">Open</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-yellow-600">{underReviewDisputes}</div>
          <div className="text-sm text-gray-600">Under Review</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-green-600">{resolvedDisputes}</div>
          <div className="text-sm text-gray-600">Resolved</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-blue-600">${(totalRefunded / 100).toFixed(2)}</div>
          <div className="text-sm text-gray-600">Total Refunded</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow">
        <form className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Status</label>
            <select
              name="status"
              defaultValue={statusFilter}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="under_review">Under Review</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Initiator</label>
            <select
              name="type"
              defaultValue={typeFilter}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            >
              <option value="all">All</option>
              <option value="customer">Customer</option>
              <option value="provider">Provider</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Search</label>
            <input
              type="text"
              name="search"
              defaultValue={searchQuery}
              placeholder="Provider name, description..."
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
            >
              Filter
            </button>
          </div>
        </form>
      </div>

      {/* Disputes Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Disputes
          </h3>
        </div>
        <div className="border-t border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Booking
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Initiator
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reason
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {disputeList.map((dispute) => (
                <tr key={dispute.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {dispute.booking.service.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {dispute.provider.businessName} (@{dispute.provider.handle})
                      </div>
                      <div className="text-xs text-gray-400">
                        {dispute.booking.scheduledAt ? dispute.booking.scheduledAt.toLocaleDateString() : "Not scheduled"}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {dispute.initiator.firstName} {dispute.initiator.lastName}
                      </div>
                      <div className="text-sm text-gray-500 capitalize">
                        {dispute.initiatorType}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 capitalize">
                      {dispute.reason.replace("_", " ")}
                    </div>
                    <div className="text-xs text-gray-500 max-w-xs truncate">
                      {dispute.description}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {dispute.amountDisputed ? `$${(dispute.amountDisputed / 100).toFixed(2)}` : "N/A"}
                    {dispute.refundAmount && (
                      <div className="text-xs text-green-600">
                        Refunded: ${(dispute.refundAmount / 100).toFixed(2)}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      dispute.status === "open" ? "bg-red-100 text-red-800" :
                      dispute.status === "under_review" ? "bg-yellow-100 text-yellow-800" :
                      dispute.status === "resolved" ? "bg-green-100 text-green-800" :
                      "bg-gray-100 text-gray-800"
                    }`}>
                      {dispute.status.replace("_", " ")}
                    </span>
                    {dispute.adminDecision && (
                      <div className="text-xs text-gray-500 mt-1 capitalize">
                        {dispute.adminDecision.replace("_", " ")}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {dispute.createdAt.toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {dispute.status === "open" && (
                      <form action={`/api/admin/disputes/${dispute.id}/review`} method="POST" className="inline">
                        <button
                          type="submit"
                          className="text-blue-600 hover:text-blue-900 mr-4"
                        >
                          Review
                        </button>
                      </form>
                    )}
                    {dispute.status === "under_review" && (
                      <Link
                        href={`/dashboard/admin/disputes/${dispute.id}`}
                        className="text-green-600 hover:text-green-900 mr-4"
                      >
                        Resolve
                      </Link>
                    )}
                    <Link
                      href={`/dashboard/admin/bookings?bookingId=${dispute.booking.id}`}
                      className="text-gray-600 hover:text-gray-900"
                    >
                      View Booking
                    </Link>
                  </td>
                </tr>
              ))}
              {disputeList.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                    No disputes found matching the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}