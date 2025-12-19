import { db } from "@/lib/db";
import { providers, users, providerSuspensions } from "@/db/schema";
import { eq, desc, and, isNotNull, lte } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { ensureUserExistsInDb } from "@/lib/user-sync";

export const dynamic = "force-dynamic";

const nzDate = new Intl.DateTimeFormat("en-NZ", {
  timeZone: "Pacific/Auckland",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatDate(value: Date | null | undefined, fallback: string) {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return nzDate.format(d);
}

function toDateInputValue(value: Date) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().split("T")[0];
  return d.toISOString().split("T")[0];
}

export default async function AdminProviderSuspensionsPage() {
  const admin = await requireAdmin();
  if (!admin.isAdmin) redirect("/dashboard");

  await ensureUserExistsInDb(admin.userId!, "admin");

  const now = new Date();

  // Auto-clear expired suspensions so the rest of the app stays consistent.
  // This keeps providers from being stuck in limited mode after endDate passes.
  const expiredSuspensions = await db
    .select({
      id: providers.id,
      suspensionReason: providers.suspensionReason,
      suspensionStartDate: providers.suspensionStartDate,
      suspensionEndDate: providers.suspensionEndDate,
    })
    .from(providers)
    .where(and(
      eq(providers.isSuspended, true),
      isNotNull(providers.suspensionEndDate),
      lte(providers.suspensionEndDate, now),
    ));

  if (expiredSuspensions.length > 0) {
    await db
      .update(providers)
      .set({
        isSuspended: false,
        suspensionReason: null,
        suspensionStartDate: null,
        suspensionEndDate: null,
        updatedAt: now,
      })
      .where(and(
        eq(providers.isSuspended, true),
        isNotNull(providers.suspensionEndDate),
        lte(providers.suspensionEndDate, now),
      ));

    await db.insert(providerSuspensions).values(
      expiredSuspensions.map((p) => ({
        id: `psusp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        providerId: p.id,
        action: "unsuspend",
        reason: p.suspensionReason ?? "Auto-unsuspended (end date reached)",
        startDate: p.suspensionStartDate,
        endDate: p.suspensionEndDate,
        performedBy: admin.userId!,
      }))
    );
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

  const providersWithDerivedSuspension = allProviders.map((p) => {
    const start = p.suspensionStartDate ? new Date(p.suspensionStartDate) : null;
    const end = p.suspensionEndDate ? new Date(p.suspensionEndDate) : null;
    const startsInFuture = !!(start && start.getTime() > now.getTime());
    const expired = !!(end && end.getTime() <= now.getTime());
    const active = p.isSuspended && !expired && !startsInFuture;
    const scheduled = p.isSuspended && startsInFuture;

    return {
      ...p,
      _suspension: {
        active,
        scheduled,
        expired,
      },
    };
  });

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
    .leftJoin(users, eq(providerSuspensions.performedBy, users.id))
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
              {providersWithDerivedSuspension
                .filter(provider => provider._suspension.active || provider._suspension.scheduled)
                .map((provider) => (
                  <tr key={provider.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {provider.businessName}
                        </div>
                        <div className="text-sm text-gray-500">
                          @{provider.handle}{provider.user?.email ? ` · ${provider.user.email}` : ""}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {provider.suspensionReason || "No reason provided"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(provider.suspensionStartDate, "N/A")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(provider.suspensionEndDate, "Indefinite")}
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
              {providersWithDerivedSuspension.filter(provider => provider._suspension.active || provider._suspension.scheduled).length === 0 && (
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
              {providersWithDerivedSuspension.map((provider) => (
                <tr key={provider.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {provider.businessName}
                      </div>
                      <div className="text-sm text-gray-500">
                        @{provider.handle}{provider.user?.email ? ` · ${provider.user.email}` : ""}
                      </div>
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
                    {!provider.isSuspended ? (
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                        Active
                      </span>
                    ) : provider._suspension.scheduled ? (
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                        Scheduled
                      </span>
                    ) : provider._suspension.active ? (
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                        Suspended
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                        Expired
                      </span>
                    )}
                    {provider.isSuspended && (
                      <div className="mt-1 text-xs text-gray-500">
                        {provider.suspensionReason ? provider.suspensionReason : "No reason"}
                        {provider.suspensionStartDate ? ` · Start: ${formatDate(provider.suspensionStartDate, "N/A")}` : ""}
                        {provider.suspensionEndDate ? ` · End: ${formatDate(provider.suspensionEndDate, "N/A")}` : ""}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {!provider.isSuspended ? (
                      <form action={`/api/admin/providers/${provider.id}/suspend`} method="POST" className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          name="reason"
                          placeholder="Reason"
                          required
                          className="min-w-[200px] flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            name="startDate"
                            required
                            defaultValue={toDateInputValue(now)}
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                          <input
                            type="date"
                            name="endDate"
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                            aria-label="End date (optional)"
                          />
                        </div>
                        <button
                          type="submit"
                          className="text-red-600 hover:text-red-900 whitespace-nowrap"
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
                        By {log.performer?.firstName ?? "Unknown"} {log.performer?.lastName ?? ""} ({log.performer?.email ?? "unknown"}) on {formatDate(log.createdAt, "N/A")}
                      </p>
                      {(log.startDate || log.endDate) && (
                        <p className="text-xs text-gray-500">
                          Period: {formatDate(log.startDate, "N/A")} - {formatDate(log.endDate, "Indefinite")}
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