import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { providerChanges, providers, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { redirect } from "next/navigation";

// TODO: Replace with actual role check utility if needed
type ClerkUser = { publicMetadata?: { role?: string } };
function isAdmin(user: ClerkUser | null | undefined): boolean {
  return user?.publicMetadata?.role === "admin";
}

export default async function AdminProviderChangesPage() {
  const user = await currentUser();
  if (!isAdmin(user)) {
    redirect("/dashboard");
  }

  // Fetch pending provider changes with provider and requester info
  const changes = await db
    .select({
      id: providerChanges.id,
      fieldName: providerChanges.fieldName,
      oldValue: providerChanges.oldValue,
      newValue: providerChanges.newValue,
      status: providerChanges.status,
      createdAt: providerChanges.createdAt,
      provider: {
        id: providers.id,
        businessName: providers.businessName,
        handle: providers.handle,
      },
      requester: {
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      },
    })
    .from(providerChanges)
    .innerJoin(providers, eq(providerChanges.providerId, providers.id))
    .innerJoin(users, eq(providerChanges.requestedBy, users.id))
    .where(eq(providerChanges.status, "pending"))
    .orderBy(desc(providerChanges.createdAt));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin: Provider Profile Change Queue</h1>
      <p className="text-gray-600">
        Review and approve/reject pending changes to provider profiles.
      </p>

      {changes.length === 0 ? (
        <p className="text-gray-500">No pending changes.</p>
      ) : (
        <div className="space-y-4">
          {changes.map((change) => (
            <div key={change.id} className="border rounded-lg p-4 bg-white shadow">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-semibold">
                    {change.provider.businessName} (@{change.provider.handle})
                  </h3>
                  <p className="text-sm text-gray-600">
                    Requested by: {change.requester.firstName} {change.requester.lastName} ({change.requester.email})
                  </p>
                  <p className="text-sm text-gray-500">
                    {change.createdAt.toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-sm">
                    {change.status}
                  </span>
                </div>
              </div>

              <div className="mb-4">
                <p className="font-medium text-sm text-gray-700 mb-1">
                  Field: {change.fieldName}
                </p>
                <div className="bg-gray-50 p-3 rounded">
                  <div className="mb-2">
                    <span className="text-red-600 font-medium">Old:</span>{" "}
                    <span className="line-through">{change.oldValue || "(empty)"}</span>
                  </div>
                  <div>
                    <span className="text-green-600 font-medium">New:</span>{" "}
                    <span>{change.newValue}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <form action={`/api/admin/provider-changes/${change.id}/approve`} method="POST" className="inline">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Approve
                  </button>
                </form>
                <form action={`/api/admin/provider-changes/${change.id}/reject`} method="POST" className="inline">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Reject
                  </button>
                </form>
                <form action={`/api/admin/provider-changes/${change.id}/flag`} method="POST" className="inline">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
                  >
                    Flag for Review
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
