import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { trustIncidents, providers, users, bookings } from "@/db/schema";
import { eq, desc, and, or, like } from "drizzle-orm";
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
  severity?: string;
  search?: string;
}

export default async function AdminTrustIncidentsPage({
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
  const severityFilter = params.severity || "all";
  const searchQuery = params.search || "";

  // Build where conditions
  const whereConditions = [];

  if (statusFilter === "resolved") {
    whereConditions.push(eq(trustIncidents.resolved, true));
  } else if (statusFilter === "unresolved") {
    whereConditions.push(eq(trustIncidents.resolved, false));
  }

  if (typeFilter !== "all") {
    whereConditions.push(eq(trustIncidents.incidentType, typeFilter));
  }

  if (severityFilter !== "all") {
    whereConditions.push(eq(trustIncidents.severity, severityFilter));
  }

  if (searchQuery) {
    whereConditions.push(
      or(
        like(providers.businessName, `%${searchQuery}%`),
        like(trustIncidents.description, `%${searchQuery}%`)
      )
    );
  }

  // Fetch trust incidents with related data
  const incidents = await db
    .select({
      id: trustIncidents.id,
      incidentType: trustIncidents.incidentType,
      severity: trustIncidents.severity,
      description: trustIncidents.description,
      trustScoreImpact: trustIncidents.trustScoreImpact,
      resolved: trustIncidents.resolved,
      resolvedAt: trustIncidents.resolvedAt,
      createdAt: trustIncidents.createdAt,
      provider: {
        businessName: providers.businessName,
        handle: providers.handle,
      },
      reporter: {
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      },
      resolver: {
        firstName: users.firstName,
        lastName: users.lastName,
      },
      booking: {
        id: bookings.id,
      },
    })
    .from(trustIncidents)
    .innerJoin(providers, eq(trustIncidents.providerId, providers.id))
    .leftJoin(users, eq(trustIncidents.reportedBy, users.id))
    .leftJoin(users, eq(trustIncidents.resolvedBy, users.id))
    .leftJoin(bookings, eq(trustIncidents.bookingId, bookings.id))
    .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
    .orderBy(desc(trustIncidents.createdAt))
    .limit(100);

  // Get summary stats
  const totalIncidents = incidents.length;
  const resolvedIncidents = incidents.filter(i => i.resolved).length;
  const unresolvedIncidents = totalIncidents - resolvedIncidents;
  const criticalIncidents = incidents.filter(i => i.severity === "critical").length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Admin: Trust Incident Log</h1>
          <p className="text-gray-600">
            Monitor and manage trust incidents affecting provider scores.
          </p>
        </div>
        <Link
          href="/dashboard/admin/trust/rules"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Manage Risk Rules
        </Link>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-gray-900">{totalIncidents}</div>
          <div className="text-sm text-gray-600">Total Incidents</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-red-600">{unresolvedIncidents}</div>
          <div className="text-sm text-gray-600">Unresolved</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-green-600">{resolvedIncidents}</div>
          <div className="text-sm text-gray-600">Resolved</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-orange-600">{criticalIncidents}</div>
          <div className="text-sm text-gray-600">Critical</div>
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
              <option value="all">All</option>
              <option value="resolved">Resolved</option>
              <option value="unresolved">Unresolved</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Type</label>
            <select
              name="type"
              defaultValue={typeFilter}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            >
              <option value="all">All Types</option>
              <option value="complaint">Complaint</option>
              <option value="violation">Violation</option>
              <option value="review_abuse">Review Abuse</option>
              <option value="service_quality">Service Quality</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Severity</label>
            <select
              name="severity"
              defaultValue={severityFilter}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            >
              <option value="all">All Severities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Search</label>
            <input
              type="text"
              name="search"
              defaultValue={searchQuery}
              placeholder="Provider name or description..."
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

      {/* Incidents Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Trust Incidents
          </h3>
        </div>
        <div className="border-t border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Provider
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Severity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Impact
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
              {incidents.map((incident) => (
                <tr key={incident.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {incident.provider.businessName}
                      </div>
                      <div className="text-sm text-gray-500">@{incident.provider.handle}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-900 capitalize">
                      {incident.incidentType.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      incident.severity === "critical" ? "bg-red-100 text-red-800" :
                      incident.severity === "high" ? "bg-orange-100 text-orange-800" :
                      incident.severity === "medium" ? "bg-yellow-100 text-yellow-800" :
                      "bg-gray-100 text-gray-800"
                    }`}>
                      {incident.severity}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 max-w-xs truncate">
                      {incident.description}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {incident.trustScoreImpact > 0 ? "+" : ""}{incident.trustScoreImpact}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      incident.resolved ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                    }`}>
                      {incident.resolved ? "Resolved" : "Open"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {incident.createdAt.toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {!incident.resolved ? (
                      <form action={`/api/admin/trust/incidents/${incident.id}/resolve`} method="POST" className="inline">
                        <button
                          type="submit"
                          className="text-green-600 hover:text-green-900 mr-4"
                        >
                          Resolve
                        </button>
                      </form>
                    ) : (
                      <span className="text-gray-500">Resolved</span>
                    )}
                    <Link
                      href={`/dashboard/admin/providers/${incident.provider.handle}`}
                      className="text-blue-600 hover:text-blue-900 ml-4"
                    >
                      View Provider
                    </Link>
                  </td>
                </tr>
              ))}
              {incidents.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-4 text-center text-sm text-gray-500">
                    No trust incidents found matching the current filters.
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