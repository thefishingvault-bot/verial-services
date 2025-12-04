"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  ServicesFilters,
  ServiceWithProvider,
  ServicesDataResult,
} from "@/lib/services-data";
import ServicesSearchAndFilters from "@/components/services/services-search-and-filters";
import { ServicesGridClient } from "@/components/services/services-grid-client";

export type ServicesPageShellProps = {
  filters: ServicesFilters;
  services: ServiceWithProvider[];
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

      router.push(`/services?${params.toString()}`);
    },
    [router, searchParams],
  );

  const handleFiltersChange = (next: ServicesFilters) => {
    setQueryParams(next);
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="w-full lg:w-72 shrink-0">
        <ServicesSearchAndFilters
          filters={filters}
          onFiltersChange={handleFiltersChange}
        />
      </aside>

      <main className="flex-1 space-y-6">
        {/* Hero + KPI stats */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Active services</p>
            <p className="mt-1 text-2xl font-semibold">{kpi.activeServices}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Customer satisfaction</p>
            <p className="mt-1 text-2xl font-semibold">
              {kpi.satisfactionRate}%
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Avg. response time</p>
            <p className="mt-1 text-2xl font-semibold">
              {kpi.avgResponseMinutes != null
                ? `~${Math.round(kpi.avgResponseMinutes / 60)}h`
                : "—"}
            </p>
          </div>
        </section>

        <section>
          <ServicesGridClient
            services={services}
            searchParams={{
              q: filters.q || undefined,
              category: filters.category || undefined,
              minPrice:
                filters.minPrice != null ? String(filters.minPrice) : undefined,
              maxPrice:
                filters.maxPrice != null ? String(filters.maxPrice) : undefined,
              rating:
                filters.rating != null ? String(filters.rating) : undefined,
              sort: filters.sort,
            }}
            hasMore={hasMore}
            currentPage={1}
          />
        </section>
      </main>
    </div>
  );
}
