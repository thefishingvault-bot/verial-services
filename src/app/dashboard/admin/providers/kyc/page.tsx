import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { providers, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { redirect } from "next/navigation";

// TODO: Replace with actual role check utility if needed
type ClerkUser = { publicMetadata?: { role?: string } };
function isAdmin(user: ClerkUser | null | undefined): boolean {
  return user?.publicMetadata?.role === "admin";
}

function getKycStatusDisplay(kycStatus: string, stripeConnectId: string | null, chargesEnabled: boolean, payoutsEnabled: boolean) {
  if (kycStatus === "verified") {
    return { status: "Verified", color: "green", description: "KYC completed and verified" };
  }
  if (kycStatus === "pending_review") {
    return { status: "Pending Review", color: "yellow", description: "Documents submitted, awaiting review" };
  }
  if (kycStatus === "in_progress") {
    return { status: "In Progress", color: "blue", description: "KYC process started" };
  }
  if (kycStatus === "rejected") {
    return { status: "Rejected", color: "red", description: "KYC verification failed" };
  }
  if (stripeConnectId && (chargesEnabled || payoutsEnabled)) {
    return { status: "KYC Required", color: "orange", description: "Stripe connected but KYC not verified" };
  }
  return { status: "Not Started", color: "gray", description: "KYC not initiated" };
}

export default async function AdminKycStatusPage() {
  const user = await currentUser();
  if (!isAdmin(user)) {
    redirect("/dashboard");
  }

  // Fetch all providers with their user info
  const allProviders = await db
    .select({
      id: providers.id,
      businessName: providers.businessName,
      handle: providers.handle,
      status: providers.status,
      kycStatus: providers.kycStatus,
      stripeConnectId: providers.stripeConnectId,
      chargesEnabled: providers.chargesEnabled,
      payoutsEnabled: providers.payoutsEnabled,
      kycSubmittedAt: providers.kycSubmittedAt,
      kycVerifiedAt: providers.kycVerifiedAt,
      createdAt: providers.createdAt,
      user: {
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      },
    })
    .from(providers)
    .innerJoin(users, eq(providers.userId, users.id))
    .orderBy(desc(providers.createdAt));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin: KYC / Identity Status Panel</h1>
      <p className="text-gray-600">
        Monitor provider verification and KYC status across the platform.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {allProviders.map((provider) => {
          const kycInfo = getKycStatusDisplay(
            provider.kycStatus,
            provider.stripeConnectId,
            provider.chargesEnabled,
            provider.payoutsEnabled
          );

          return (
            <div key={provider.id} className="border rounded-lg p-4 bg-white shadow">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-semibold text-lg">{provider.businessName}</h3>
                  <p className="text-sm text-gray-600">@{provider.handle}</p>
                  <p className="text-sm text-gray-500">
                    {provider.user.firstName} {provider.user.lastName} ({provider.user.email})
                  </p>
                </div>
                <div className="text-right">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    provider.status === "approved" ? "bg-green-100 text-green-800" :
                    provider.status === "pending" ? "bg-yellow-100 text-yellow-800" :
                    "bg-red-100 text-red-800"
                  }`}>
                    {provider.status}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <span className="text-sm font-medium">KYC Status:</span>
                  <div className={`inline-block ml-2 px-2 py-1 rounded text-xs font-medium ${
                    kycInfo.color === "green" ? "bg-green-100 text-green-800" :
                    kycInfo.color === "yellow" ? "bg-yellow-100 text-yellow-800" :
                    kycInfo.color === "blue" ? "bg-blue-100 text-blue-800" :
                    kycInfo.color === "orange" ? "bg-orange-100 text-orange-800" :
                    kycInfo.color === "red" ? "bg-red-100 text-red-800" :
                    "bg-gray-100 text-gray-800"
                  }`}>
                    {kycInfo.status}
                  </div>
                </div>
                <p className="text-xs text-gray-600">{kycInfo.description}</p>

                <div className="text-xs text-gray-500">
                  <div>Stripe: {provider.stripeConnectId ? "Connected" : "Not Connected"}</div>
                  <div>Charges: {provider.chargesEnabled ? "Enabled" : "Disabled"}</div>
                  <div>Payouts: {provider.payoutsEnabled ? "Enabled" : "Disabled"}</div>
                  {provider.kycSubmittedAt && (
                    <div>Submitted: {provider.kycSubmittedAt.toLocaleDateString()}</div>
                  )}
                  {provider.kycVerifiedAt && (
                    <div>Verified: {provider.kycVerifiedAt.toLocaleDateString()}</div>
                  )}
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <a
                  href={`/dashboard/admin/providers/${provider.id}`}
                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                >
                  View Details
                </a>
                <button
                  className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
                  // TODO: Add update KYC status action
                >
                  Update Status
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {allProviders.length === 0 && (
        <p className="text-gray-500">No providers found.</p>
      )}
    </div>
  );
}
