"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  ServicesFilters,
  ServiceWithProviderAndFavorite,
  ServicesDataResult,
} from "@/lib/services-data";
import ServicesSearchAndFilters from "@/components/services/services-search-and-filters";
import { ServicesGridClient } from "@/components/services/services-grid-client";

export type ServicesPageShellProps = {
  filters: ServicesFilters;
  services: ServiceWithProviderAndFavorite[];
  totalCount: number;
  hasMore: boolean;
  kpi: ServicesDataResult["kpi"];
};

export default function ServicesPageShell({
  filters,
  services,
  totalCount,
  hasMore,
  kpi,
}: ServicesPageShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setQueryParams = useCallback(
    (nextFilters: ServicesFilters) => {
      const params = new URLSearchParams(searchParams.toString());

      const setOrDelete = (key: string, value: string | null) => {
        if (value && value.length > 0) params.set(key, value);
        else params.delete(key);
      };

      setOrDelete("q", nextFilters.q || null);
      setOrDelete("category", nextFilters.category);
      setOrDelete(
        "minPrice",
        nextFilters.minPrice != null ? String(nextFilters.minPrice) : null,
      );
      setOrDelete(
        "maxPrice",
        nextFilters.maxPrice != null ? String(nextFilters.maxPrice) : null,
      );
      setOrDelete(
        "rating",
        nextFilters.rating != null ? String(nextFilters.rating) : null,
      );
      setOrDelete("sort", nextFilters.sort || null);
      setOrDelete("region", nextFilters.region);

      // pagination
      const nextPage = nextFilters.page || 1;
      const nextPageSize = nextFilters.pageSize || 12;

      if (nextPage > 1) {
        setOrDelete("page", String(nextPage));
      } else {
        params.delete("page");
      }

      if (nextPageSize !== 12) {
        setOrDelete("pageSize", String(nextPageSize));
      } else {
        params.delete("pageSize");
      }

      router.push(`/services?${params.toString()}`);
    },
    [router, searchParams],
  );

  const handleFiltersChange = (next: ServicesFilters) => {
    setQueryParams(next);
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 lg:px-8 lg:py-10">
      <div className="space-y-6">
        {/* Search + filters (top, sticky under header) */}
        <div className="sticky top-0 z-40 -mt-16 border-b border-border bg-background pt-16 pb-4 md:static md:top-auto md:z-auto md:mt-0 md:pt-0">
          <ServicesSearchAndFilters filters={filters} onFiltersChange={handleFiltersChange} />
        </div>

        {/* Results */}
        <main className="space-y-6">
          {/* KPI row */}
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl border bg-white shadow-sm">
              <div className="px-4 pt-3 pb-1">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Active services
                </p>
              </div>
              <div className="px-4 pb-4">
                <p className="text-2xl font-semibold text-slate-900">
                  {kpi.activeServices}
                </p>
              </div>
            </div>
            <div className="rounded-xl border bg-white shadow-sm">
              <div className="px-4 pt-3 pb-1">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Customer satisfaction
                </p>
              </div>
              <div className="px-4 pb-4">
                <p className="text-2xl font-semibold text-slate-900">
                  {kpi.satisfactionRate}%
                </p>
              </div>
            </div>
          </section>

          {/* Results + grid */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">
              {totalCount} {totalCount === 1 ? 'service' : 'services'} found
            </h2>
            <ServicesGridClient
              services={services}
              searchParams={{
                q: filters.q || undefined,
                category: filters.category || undefined,
                region: filters.region || undefined,
                minPrice:
                  filters.minPrice != null ? String(filters.minPrice) : undefined,
                maxPrice:
                  filters.maxPrice != null ? String(filters.maxPrice) : undefined,
                rating:
                  filters.rating != null ? String(filters.rating) : undefined,
                sort: filters.sort,
                page: String(filters.page || 1),
                pageSize: String(filters.pageSize || 12),
              }}
              hasMore={hasMore}
              currentPage={filters.page || 1}
            />
          </section>
        </main>
      </div>
    </div>
  );
}
