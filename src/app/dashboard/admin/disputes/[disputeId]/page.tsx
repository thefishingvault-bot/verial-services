import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { disputes, bookings, users, providers, services } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";

// TODO: Replace with actual role check utility if needed
type ClerkUser = { publicMetadata?: { role?: string } };
function isAdmin(user: ClerkUser | null | undefined): boolean {
  return user?.publicMetadata?.role === "admin";
}

export default async function AdminDisputeDetailPage({
  params,
}: {
  params: Promise<{ disputeId: string }>;
}) {
  const user = await currentUser();
  if (!isAdmin(user)) {
    redirect("/dashboard");
  }

  const { disputeId } = await params;

  // Get basic dispute info
  const [disputeBase] = await db
    .select({
      id: disputes.id,
      reason: disputes.reason,
      description: disputes.description,
      evidenceUrls: disputes.evidenceUrls,
      amountDisputed: disputes.amountDisputed,
      status: disputes.status,
      adminDecision: disputes.adminDecision,
      adminNotes: disputes.adminNotes,
      refundAmount: disputes.refundAmount,
      createdAt: disputes.createdAt,
      updatedAt: disputes.updatedAt,
      initiatorType: disputes.initiatorType,
      bookingId: disputes.bookingId,
      initiatorId: disputes.initiatorId,
    })
    .from(disputes)
    .where(eq(disputes.id, disputeId))
    .limit(1);

  if (!disputeBase) {
    redirect("/dashboard/admin/disputes");
  }

  // Get booking details
  const [booking] = await db
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
    .where(eq(bookings.id, disputeBase.bookingId))
    .limit(1);

  if (!booking) {
    redirect("/dashboard/admin/disputes");
  }

  // Get service details
  const [service] = await db
    .select({
      id: services.id,
      name: services.title,
      description: services.description,
      price: services.priceInCents,
    })
    .from(services)
    .where(eq(services.id, booking.serviceId))
    .limit(1);

  // Get provider details
  const [provider] = await db
    .select({
      id: providers.id,
      businessName: providers.businessName,
      handle: providers.handle,
      trustScore: providers.trustScore,
      trustLevel: providers.trustLevel,
      userId: providers.userId,
    })
    .from(providers)
    .where(eq(providers.id, booking.providerId))
    .limit(1);

  // Get user details
  const [initiator] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, disputeBase.initiatorId))
    .limit(1);

  const [customer] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, booking.userId))
    .limit(1);

  const [providerUser] = provider ? await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, provider.userId))
    .limit(1) : [null];

  const dispute = {
    ...disputeBase,
    booking: {
      ...booking,
      service: service || { id: '', name: '', description: '', price: 0 },
    },
    initiator: initiator || { id: '', firstName: null, lastName: null, email: '' },
    customer: customer || { id: '', firstName: null, lastName: null, email: '' },
    provider: provider ? {
      ...provider,
      user: providerUser || { firstName: null, lastName: null, email: '' },
    } : undefined,
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Dispute Resolution</h1>
          <p className="text-gray-600">
            Review and resolve dispute #{dispute.id}
          </p>
        </div>
        <Link
          href="/dashboard/admin/disputes"
          className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
        >
          Back to Disputes
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dispute Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Dispute Info */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Dispute Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full mt-1 ${
                  dispute.status === "open" ? "bg-red-100 text-red-800" :
                  dispute.status === "under_review" ? "bg-yellow-100 text-yellow-800" :
                  dispute.status === "resolved" ? "bg-green-100 text-green-800" :
                  "bg-gray-100 text-gray-800"
                }`}>
                  {dispute.status.replace("_", " ")}
                </span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Reason</label>
                <span className="text-sm text-gray-900 capitalize mt-1 block">
                  {dispute.reason.replace("_", " ")}
                </span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Amount Disputed</label>
                <span className="text-sm text-gray-900 mt-1 block">
                  {dispute.amountDisputed ? `$${(dispute.amountDisputed / 100).toFixed(2)}` : "N/A"}
                </span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Created</label>
                <span className="text-sm text-gray-900 mt-1 block">
                  {dispute.createdAt.toLocaleDateString()} {dispute.createdAt.toLocaleTimeString()}
                </span>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <p className="text-sm text-gray-900 mt-1 bg-gray-50 p-3 rounded">
                {dispute.description}
              </p>
            </div>
            {dispute.adminNotes && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">Admin Notes</label>
                <p className="text-sm text-gray-900 mt-1 bg-blue-50 p-3 rounded">
                  {dispute.adminNotes}
                </p>
              </div>
            )}
          </div>

          {/* Booking Details */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Booking Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Service</label>
                <span className="text-sm text-gray-900 mt-1 block">{dispute.booking.service.name}</span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Booking Status</label>
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full mt-1 ${
                  dispute.booking.status === "completed" ? "bg-green-100 text-green-800" :
                  dispute.booking.status === "confirmed" ? "bg-blue-100 text-blue-800" :
                  dispute.booking.status === "canceled" ? "bg-red-100 text-red-800" :
                  "bg-gray-100 text-gray-800"
                }`}>
                  {dispute.booking.status}
                </span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Scheduled Date</label>
                <span className="text-sm text-gray-900 mt-1 block">
                  {dispute.booking.scheduledAt ? 
                    `${dispute.booking.scheduledAt.toLocaleDateString()} ${dispute.booking.scheduledAt.toLocaleTimeString()}` : 
                    "Not scheduled"}
                </span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Total Amount</label>
                <span className="text-sm text-gray-900 mt-1 block">
                  ${(dispute.booking.totalAmount / 100).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Resolution Form */}
          {dispute.status === "under_review" && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Make Resolution Decision</h2>
              <form action={`/api/admin/disputes/${dispute.id}/resolve`} method="POST" className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Decision</label>
                  <select
                    name="decision"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  >
                    <option value="">Select a decision...</option>
                    <option value="refund_customer">Full Refund to Customer</option>
                    <option value="partial_refund">Partial Refund to Customer</option>
                    <option value="no_refund">No Refund</option>
                    <option value="service_redo">Service Redo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Refund Amount (cents)</label>
                  <input
                    type="number"
                    name="refundAmount"
                    placeholder="0"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Leave empty for no refund</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Admin Notes</label>
                  <textarea
                    name="adminNotes"
                    rows={4}
                    required
                    placeholder="Explain your decision and reasoning..."
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex gap-4">
                  <button
                    type="submit"
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                  >
                    Resolve Dispute
                  </button>
                  <Link
                    href="/dashboard/admin/disputes"
                    className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
                  >
                    Cancel
                  </Link>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Parties Involved */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Parties Involved</h2>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700">Initiator ({dispute.initiatorType})</h3>
                <div className="mt-1">
                  <p className="text-sm text-gray-900">
                    {dispute.initiator.firstName} {dispute.initiator.lastName}
                  </p>
                  <p className="text-sm text-gray-500">{dispute.initiator.email}</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700">Customer</h3>
                <div className="mt-1">
                  <p className="text-sm text-gray-900">
                    {dispute.customer?.firstName} {dispute.customer?.lastName}
                  </p>
                  <p className="text-sm text-gray-500">{dispute.customer?.email}</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700">Provider</h3>
                <div className="mt-1">
                  {dispute.provider ? (
                    <>
                      <p className="text-sm text-gray-900">{dispute.provider.businessName}</p>
                      <p className="text-sm text-gray-500">@{dispute.provider.handle}</p>
                      <p className="text-sm text-gray-500">{dispute.provider.user.firstName} {dispute.provider.user.lastName}</p>
                      <div className="mt-2">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          dispute.provider.trustLevel === "platinum" ? "bg-purple-100 text-purple-800" :
                          dispute.provider.trustLevel === "gold" ? "bg-yellow-100 text-yellow-800" :
                          dispute.provider.trustLevel === "silver" ? "bg-gray-100 text-gray-800" :
                          "bg-gray-100 text-gray-800"
                        }`}>
                          {dispute.provider.trustLevel} ({dispute.provider.trustScore})
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">Provider information not available</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Evidence */}
          {dispute.evidenceUrls && dispute.evidenceUrls.length > 0 && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Evidence</h2>
              <div className="space-y-2">
                {dispute.evidenceUrls.map((url, index) => (
                  <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-blue-600 hover:text-blue-800"
                  >
                    Evidence {index + 1}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Resolution Summary */}
          {dispute.status === "resolved" && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <h2 className="text-lg font-medium text-green-900 mb-4">Resolution Summary</h2>
              <div className="space-y-2">
                <div>
                  <span className="text-sm font-medium text-green-800">Decision:</span>
                  <span className="text-sm text-green-700 ml-2 capitalize">
                    {dispute.adminDecision?.replace("_", " ")}
                  </span>
                </div>
                {dispute.refundAmount && (
                  <div>
                    <span className="text-sm font-medium text-green-800">Refund Amount:</span>
                    <span className="text-sm text-green-700 ml-2">
                      ${(dispute.refundAmount / 100).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}