"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ServicesFilters,
  ServiceWithProviderAndFavorite,
  ServicesDataResult,
} from "@/lib/services-data";
import ServicesSearchAndFilters from "@/components/services/services-search-and-filters";
import { ServicesGridClient } from "@/components/services/services-grid-client";
import { Button } from "@/components/ui/button";

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
  const [appliedFilters, setAppliedFilters] = useState<ServicesFilters>(filters);
  const [items, setItems] = useState<ServiceWithProviderAndFavorite[]>(services);
  const [count, setCount] = useState<number>(totalCount);
  const [more, setMore] = useState<boolean>(hasMore);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const initialFiltersKey = useMemo(() => {
    return [
      filters.q,
      filters.category ?? "",
      filters.region ?? "",
      filters.minPrice ?? "",
      filters.maxPrice ?? "",
      filters.rating ?? "",
      filters.sort,
      filters.page,
      filters.pageSize,
    ].join("|");
  }, [filters]);

  const abortRef = useRef<AbortController | null>(null);
  const lastRequestRef = useRef<
    { filters: ServicesFilters; mode: "replace" | "append" } | null
  >(null);

  const buildSearchParams = useCallback((nextFilters: ServicesFilters) => {
    const params = new URLSearchParams();
    const setOrDelete = (key: string, value: string | null | undefined) => {
      if (value != null && value.length > 0) params.set(key, value);
      else params.delete(key);
    };

    setOrDelete("q", nextFilters.q || null);
    setOrDelete("category", nextFilters.category ?? null);
    setOrDelete("region", nextFilters.region ?? null);
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

    if ((nextFilters.page || 1) > 1) {
      setOrDelete("page", String(nextFilters.page || 1));
    }
    if ((nextFilters.pageSize || 12) !== 12) {
      setOrDelete("pageSize", String(nextFilters.pageSize || 12));
    }

    return params;
  }, []);

  const updateUrlWithoutNavigation = useCallback(
    (nextFilters: ServicesFilters) => {
      if (typeof window === "undefined") return;
      const params = buildSearchParams(nextFilters);
      const qs = params.toString();
      const url = qs.length > 0 ? `/services?${qs}` : "/services";
      window.history.replaceState(null, "", url);
    },
    [buildSearchParams],
  );

  const fetchServices = useCallback(
    async (nextFilters: ServicesFilters, mode: "replace" | "append") => {
      lastRequestRef.current = { filters: nextFilters, mode };
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const params = buildSearchParams(nextFilters);
      const url = `/api/services/list?${params.toString()}`;

      try {
        setErrorMessage(null);
        if (mode === "replace") setLoading(true);
        else setLoadingMore(true);

        const res = await fetch(url, {
          method: "GET",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });

        if (!res.ok) {
          throw new Error(`Failed to fetch services (${res.status})`);
        }

        const json = (await res.json()) as {
          services: ServiceWithProviderAndFavorite[];
          page: number;
          pageSize: number;
          hasMore: boolean;
          totalCount: number;
        };

        setAppliedFilters((prev) => ({
          ...prev,
          ...nextFilters,
          page: json.page,
          pageSize: json.pageSize,
        }));
        setCount(json.totalCount);
        setMore(json.hasMore);
        setItems((prev) =>
          mode === "append" ? [...prev, ...json.services] : json.services,
        );
        updateUrlWithoutNavigation({
          ...nextFilters,
          page: json.page,
          pageSize: json.pageSize,
        });
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        console.error("[SERVICES_PAGE_FETCH]", e);
        setErrorMessage("Couldn't load services. Please try again.");
      } finally {
        if (mode === "replace") setLoading(false);
        else setLoadingMore(false);
      }
    },
    [buildSearchParams, updateUrlWithoutNavigation],
  );

  const handleRetry = useCallback(() => {
    const last = lastRequestRef.current;
    if (!last) return;
    fetchServices(last.filters, last.mode);
  }, [fetchServices]);

  useEffect(() => {
    // Keep state in sync when SSR props change (e.g., hard reload / link share)
    setAppliedFilters(filters);
    setItems(services);
    setCount(totalCount);
    setMore(hasMore);
    setErrorMessage(null);
  }, [filters, services, totalCount, hasMore]);

  const handleFiltersChange = useCallback(
    (next: ServicesFilters) => {
      const normalized: ServicesFilters = {
        ...next,
        page: 1,
        pageSize: next.pageSize ?? appliedFilters.pageSize ?? 12,
      };
      setAppliedFilters(normalized);
      fetchServices(normalized, "replace");
    },
    [appliedFilters.pageSize, fetchServices],
  );

  const handleLoadMore = useCallback(() => {
    if (loadingMore || loading) return;
    const nextPage = (appliedFilters.page || 1) + 1;
    const nextFilters: ServicesFilters = { ...appliedFilters, page: nextPage };
    fetchServices(nextFilters, "append");
  }, [appliedFilters, fetchServices, loading, loadingMore]);

  const servicesForGrid = useMemo(() => items, [items]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 lg:px-8 lg:py-10">
      <div className="space-y-6">
        {/* Search + filters */}
        <div className="border-b border-border bg-background pb-4">
          <ServicesSearchAndFilters
            key={initialFiltersKey}
            filters={appliedFilters}
            onFiltersChange={handleFiltersChange}
          />
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
                  {kpi.satisfactionRate != null ? `${kpi.satisfactionRate}%` : "—"}
                </p>
              </div>
            </div>
          </section>

          {/* Results + grid */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">
              {count} {count === 1 ? "service" : "services"} found
            </h2>

            {errorMessage && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-destructive">{errorMessage}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetry}
                    disabled={loading || loadingMore}
                  >
                    Retry
                  </Button>
                </div>
              </div>
            )}

            <ServicesGridClient
              services={servicesForGrid}
              searchParams={{
                q: appliedFilters.q || undefined,
                category: appliedFilters.category || undefined,
                region: appliedFilters.region || undefined,
                minPrice:
                  appliedFilters.minPrice != null
                    ? String(appliedFilters.minPrice)
                    : undefined,
                maxPrice:
                  appliedFilters.maxPrice != null
                    ? String(appliedFilters.maxPrice)
                    : undefined,
                rating:
                  appliedFilters.rating != null
                    ? String(appliedFilters.rating)
                    : undefined,
                sort: appliedFilters.sort,
                page: String(appliedFilters.page || 1),
                pageSize: String(appliedFilters.pageSize || 12),
              }}
              hasMore={more}
              currentPage={appliedFilters.page || 1}
              isLoading={loading}
              isLoadingMore={loadingMore}
              onLoadMore={handleLoadMore}
            />
          </section>
        </main>
      </div>
    </div>
  );
}
