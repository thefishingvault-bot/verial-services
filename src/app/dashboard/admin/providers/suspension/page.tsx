import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { providers, users, providerSuspensions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { redirect } from "next/navigation";

// TODO: Replace with actual role check utility if needed
type ClerkUser = { publicMetadata?: { role?: string } };
function isAdmin(user: ClerkUser | null | undefined): boolean {
  return user?.publicMetadata?.role === "admin";
}

export default async function AdminProviderSuspensionsPage() {
  const user = await currentUser();
  if (!isAdmin(user)) {
    redirect("/dashboard");
  }

  // Fetch all providers with suspension status
  const allProviders = await db
    .select({
      id: providers.id,
      businessName: providers.businessName,
      handle: providers.handle,
      status: providers.status,
      isSuspended: providers.isSuspended,
      suspensionReason: providers.suspensionReason,
      suspensionStartDate: providers.suspensionStartDate,
      suspensionEndDate: providers.suspensionEndDate,
      user: {
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      },
    })
    .from(providers)
    .innerJoin(users, eq(providers.userId, users.id))
    .orderBy(desc(providers.createdAt));

  // Fetch suspension audit log
  const suspensionLog = await db
    .select({
      id: providerSuspensions.id,
      action: providerSuspensions.action,
      reason: providerSuspensions.reason,
      startDate: providerSuspensions.startDate,
      endDate: providerSuspensions.endDate,
      createdAt: providerSuspensions.createdAt,
      provider: {
        businessName: providers.businessName,
        handle: providers.handle,
      },
      performer: {
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      },
    })
    .from(providerSuspensions)
    .innerJoin(providers, eq(providerSuspensions.providerId, providers.id))
    .innerJoin(users, eq(providerSuspensions.performedBy, users.id))
    .orderBy(desc(providerSuspensions.createdAt))
    .limit(50);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Admin: Provider Suspension / Limited Mode</h1>
          <p className="text-gray-600">
            Manage provider suspensions and limited access states.
          </p>
        </div>
      </div>

      {/* Current Suspensions */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Currently Suspended Providers
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Providers in limited mode cannot accept new bookings but can complete existing ones.
          </p>
        </div>
        <div className="border-t border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Provider
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reason
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Start Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  End Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {allProviders
                .filter(provider => provider.isSuspended)
                .map((provider) => (
                  <tr key={provider.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {provider.businessName}
                        </div>
                        <div className="text-sm text-gray-500">@{provider.handle}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {provider.suspensionReason || "No reason provided"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {provider.suspensionStartDate?.toLocaleDateString() || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {provider.suspensionEndDate?.toLocaleDateString() || "Indefinite"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <form action={`/api/admin/providers/${provider.id}/unsuspend`} method="POST" className="inline">
                        <button
                          type="submit"
                          className="text-green-600 hover:text-green-900 mr-4"
                        >
                          Unsuspend
                        </button>
                      </form>
                      <a
                        href={`/dashboard/admin/providers/${provider.id}`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View Details
                      </a>
                    </td>
                  </tr>
                ))}
              {allProviders.filter(provider => provider.isSuspended).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                    No providers are currently suspended.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* All Providers */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            All Providers
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Suspend or unsuspend providers as needed.
          </p>
        </div>
        <div className="border-t border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Provider
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Suspension Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {allProviders.map((provider) => (
                <tr key={provider.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {provider.businessName}
                      </div>
                      <div className="text-sm text-gray-500">@{provider.handle}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      provider.status === "approved" ? "bg-green-100 text-green-800" :
                      provider.status === "pending" ? "bg-yellow-100 text-yellow-800" :
                      "bg-red-100 text-red-800"
                    }`}>
                      {provider.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      provider.isSuspended ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
                    }`}>
                      {provider.isSuspended ? "Suspended" : "Active"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {!provider.isSuspended ? (
                      <form action={`/api/admin/providers/${provider.id}/suspend`} method="POST" className="inline">
                        <input
                          type="text"
                          name="reason"
                          placeholder="Suspension reason"
                          required
                          className="mr-2 px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                        <input
                          type="date"
                          name="startDate"
                          required
                          defaultValue={new Date().toISOString().split('T')[0]}
                          className="mr-2 px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                        <input
                          type="date"
                          name="endDate"
                          placeholder="Optional end date"
                          className="mr-2 px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                        <button
                          type="submit"
                          className="text-red-600 hover:text-red-900"
                        >
                          Suspend
                        </button>
                      </form>
                    ) : (
                      <form action={`/api/admin/providers/${provider.id}/unsuspend`} method="POST" className="inline">
                        <button
                          type="submit"
                          className="text-green-600 hover:text-green-900 mr-4"
                        >
                          Unsuspend
                        </button>
                      </form>
                    )}
                    <a
                      href={`/dashboard/admin/providers/${provider.id}`}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      View Details
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Suspension Audit Log */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Suspension Audit Log
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Recent suspension and unsuspension actions.
          </p>
        </div>
        <div className="border-t border-gray-200">
          <div className="px-4 py-5 sm:p-6">
            <div className="space-y-4">
              {suspensionLog.map((log) => (
                <div key={log.id} className="border-l-4 border-blue-400 bg-blue-50 p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        log.action === "suspend" ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
                      }`}>
                        {log.action}
                      </span>
                    </div>
                    <div className="ml-3 flex-1">
                      <p className="text-sm text-gray-900">
                        <strong>{log.provider.businessName}</strong> was {log.action}ed
                        {log.reason && ` for: ${log.reason}`}
                      </p>
                      <p className="text-xs text-gray-500">
                        By {log.performer.firstName} {log.performer.lastName} ({log.performer.email}) on {log.createdAt.toLocaleDateString()}
                      </p>
                      {(log.startDate || log.endDate) && (
                        <p className="text-xs text-gray-500">
                          Period: {log.startDate?.toLocaleDateString() || "N/A"} - {log.endDate?.toLocaleDateString() || "Indefinite"}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {suspensionLog.length === 0 && (
                <p className="text-sm text-gray-500">No suspension actions recorded yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}