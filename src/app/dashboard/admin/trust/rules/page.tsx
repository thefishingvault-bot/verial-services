import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { riskRules, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";

// TODO: Replace with actual role check utility if needed
type ClerkUser = { publicMetadata?: { role?: string } };
function isAdmin(user: ClerkUser | null | undefined): boolean {
  return user?.publicMetadata?.role === "admin";
}

export default async function AdminRiskRulesPage() {
  const user = await currentUser();
  if (!isAdmin(user)) {
    redirect("/dashboard");
  }

  // Fetch all risk rules with creator info
  const rules = await db
    .select({
      id: riskRules.id,
      name: riskRules.name,
      incidentType: riskRules.incidentType,
      severity: riskRules.severity,
      trustScorePenalty: riskRules.trustScorePenalty,
      autoSuspend: riskRules.autoSuspend,
      suspendDurationDays: riskRules.suspendDurationDays,
      enabled: riskRules.enabled,
      createdAt: riskRules.createdAt,
      updatedAt: riskRules.updatedAt,
      creator: {
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      },
    })
    .from(riskRules)
    .innerJoin(users, eq(riskRules.createdBy, users.id))
    .orderBy(desc(riskRules.createdAt));

  // Get summary stats
  const totalRules = rules.length;
  const enabledRules = rules.filter(r => r.enabled).length;
  const autoSuspendRules = rules.filter(r => r.autoSuspend && r.enabled).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Admin: Risk Rules Management</h1>
          <p className="text-gray-600">
            Configure automated responses to trust incidents and violations.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/admin/trust"
            className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
          >
            View Incidents
          </Link>
          <button
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            onClick={() => alert("Create rule form would open here")}
          >
            Create Rule
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-gray-900">{totalRules}</div>
          <div className="text-sm text-gray-600">Total Rules</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-green-600">{enabledRules}</div>
          <div className="text-sm text-gray-600">Enabled Rules</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-red-600">{autoSuspendRules}</div>
          <div className="text-sm text-gray-600">Auto-Suspend Rules</div>
        </div>
      </div>

      {/* Rules Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Risk Rules
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Rules that automatically penalize trust scores and trigger suspensions based on incident types and severity.
          </p>
        </div>
        <div className="border-t border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rule Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Incident Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Severity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trust Penalty
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Auto Suspend
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {rule.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-900 capitalize">
                      {rule.incidentType.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      rule.severity === "critical" ? "bg-red-100 text-red-800" :
                      rule.severity === "high" ? "bg-orange-100 text-orange-800" :
                      rule.severity === "medium" ? "bg-yellow-100 text-yellow-800" :
                      "bg-gray-100 text-gray-800"
                    }`}>
                      {rule.severity}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    -{rule.trustScorePenalty}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      rule.autoSuspend ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800"
                    }`}>
                      {rule.autoSuspend ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {rule.suspendDurationDays ? `${rule.suspendDurationDays} days` : "Indefinite"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      rule.enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                    }`}>
                      {rule.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {rule.createdAt.toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <form action={`/api/admin/trust/rules/${rule.id}/toggle`} method="POST" className="inline">
                      <button
                        type="submit"
                        className={`mr-4 ${rule.enabled ? "text-red-600 hover:text-red-900" : "text-green-600 hover:text-green-900"}`}
                      >
                        {rule.enabled ? "Disable" : "Enable"}
                      </button>
                    </form>
                    <button
                      className="text-blue-600 hover:text-blue-900"
                      onClick={() => alert("Edit rule form would open here")}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {rules.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-4 text-center text-sm text-gray-500">
                    No risk rules configured yet. Create your first rule to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Default Rules Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-lg font-medium text-blue-900 mb-2">Default Risk Rules</h3>
        <p className="text-blue-800 mb-4">
          Consider creating these default rules to automatically handle common trust incidents:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="bg-white p-3 rounded border">
            <strong>Customer Complaint (High)</strong>
            <br />Penalty: -10 points, Auto-suspend: No
          </div>
          <div className="bg-white p-3 rounded border">
            <strong>Service Violation (Critical)</strong>
            <br />Penalty: -25 points, Auto-suspend: 7 days
          </div>
          <div className="bg-white p-3 rounded border">
            <strong>Review Abuse (Medium)</strong>
            <br />Penalty: -15 points, Auto-suspend: No
          </div>
          <div className="bg-white p-3 rounded border">
            <strong>Repeated Offenses (Critical)</strong>
            <br />Penalty: -50 points, Auto-suspend: Indefinite
          </div>
        </div>
      </div>
    </div>
  );
}