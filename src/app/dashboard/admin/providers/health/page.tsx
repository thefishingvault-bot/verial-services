"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type SortOption = "bookings" | "cancellations" | "reviews" | "trust" | "created";

type ProviderHealth = {
  id: string;
  businessName: string;
  handle: string;
  status: string;
  trustLevel: string;
  trustScore: number;
  createdAt: Date;
  user: {
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  totalReviews: number;
  avgRating: number | null;
  cancellationRate: number;
  completionRate: number;
};

export default function AdminProviderHealthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [loading, setLoading] = useState(true);

  const sortBy = (searchParams.get("sort") as SortOption) || "bookings";
  const sortOrder = searchParams.get("order") === "asc" ? "asc" : "desc";

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/providers/health?sort=${sortBy}&order=${sortOrder}`);
      if (response.ok) {
        const data = await response.json();
        setProviders(data);
      }
    } catch (error) {
      console.error("Error fetching providers:", error);
    } finally {
      setLoading(false);
    }
  }, [sortBy, sortOrder]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const handleSortChange = (newSort: SortOption) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", newSort);
    router.push(`?${params.toString()}`);
  };

  const handleOrderChange = (newOrder: "asc" | "desc") => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("order", newOrder);
    router.push(`?${params.toString()}`);
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Admin: Provider Health Overview</h1>
          <p className="text-gray-600">
            Monitor provider performance metrics and identify at-risk accounts.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            className="border px-3 py-2 rounded"
            value={sortBy}
            onChange={(e) => handleSortChange(e.target.value as SortOption)}
          >
            <option value="bookings">Highest Volume</option>
            <option value="cancellations">Most Cancellations</option>
            <option value="reviews">Most Reviews</option>
            <option value="trust">Lowest Trust</option>
            <option value="created">Newest</option>
          </select>
          <select
            className="border px-3 py-2 rounded"
            value={sortOrder}
            onChange={(e) => handleOrderChange(e.target.value as "asc" | "desc")}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Provider
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Bookings
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Completion Rate
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Cancellation Rate
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reviews
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Trust Score
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {providers.map((provider) => (
              <tr key={provider.id} className="hover:bg-gray-50">
                <td className="px-4 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {provider.businessName}
                    </div>
                    <div className="text-sm text-gray-500">@{provider.handle}</div>
                    <div className="text-xs text-gray-400">
                      {provider.user.firstName} {provider.user.lastName}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    provider.status === "approved" ? "bg-green-100 text-green-800" :
                    provider.status === "pending" ? "bg-yellow-100 text-yellow-800" :
                    "bg-red-100 text-red-800"
                  }`}>
                    {provider.status}
                  </span>
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                  {provider.totalBookings}
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <span className={`text-sm ${
                    provider.completionRate >= 80 ? "text-green-600" :
                    provider.completionRate >= 60 ? "text-yellow-600" :
                    "text-red-600"
                  }`}>
                    {provider.completionRate.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <span className={`text-sm ${
                    provider.cancellationRate <= 10 ? "text-green-600" :
                    provider.cancellationRate <= 20 ? "text-yellow-600" :
                    "text-red-600"
                  }`}>
                    {provider.cancellationRate.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                  {provider.totalReviews} reviews
                  {provider.avgRating && (
                    <div className="text-xs text-gray-500">
                      {provider.avgRating.toFixed(1)} ★
                    </div>
                  )}
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{provider.trustScore}</div>
                  <div className="text-xs text-gray-500 capitalize">{provider.trustLevel}</div>
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
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

      {providers.length === 0 && (
        <p className="text-gray-500 text-center py-8">No providers found.</p>
      )}
    </div>
  );
}
