'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Filter, MapPin, Grid3X3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { CheckCircle } from 'lucide-react';
import ServicesSearchAndFilters from '@/components/services/services-search-and-filters';
import { ServicesGridClient } from '@/components/services/services-grid-client';
import { ServicesMap } from '@/components/services/services-map';
import { ServicesLoading } from '@/components/services/services-loading';
import { ServicesAdvancedFilters } from '@/components/services/services-advanced-filters';
import type { ServiceWithProvider, ServicesFilterState } from '@/lib/services-data';

interface ServicesPageClientProps {
  initialFilters: ServicesFilterState;
  initialServicesData: {
    services: ServiceWithProvider[];
    hasMore: boolean;
    totalCount: number;
  };
  stats: {
    totalServices: number;
    averageRating: number;
  };
  initialParams: Record<string, string>;
}

const ServicesPageClient = ({ initialFilters, initialServicesData, stats, initialParams }: ServicesPageClientProps) => {
  const [filters, setFilters] = useState<ServicesFilterState>(initialFilters);
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [servicesData, setServicesData] = useState(initialServicesData);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const buildQueryFromFilters = (state: ServicesFilterState, extra: Record<string, string> = {}) => {
    const params = new URLSearchParams();

    if (state.categories?.length) params.set('category', state.categories[0]);
    if (state.minPrice != null) params.set('minPrice', String(state.minPrice));
    if (state.maxPrice != null) params.set('maxPrice', String(state.maxPrice));
    if (state.minRating != null) params.set('rating', String(state.minRating));
    if (state.search) params.set('q', state.search);
    if (state.sort) params.set('sort', state.sort);

    Object.entries(extra).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    return params;
  };

  const fetchServices = async (nextFilters: ServicesFilterState) => {
    try {
      setLoading(true);
      const params = buildQueryFromFilters(nextFilters, { page: '1' });
      const res = await fetch(`/api/services/list?${params.toString()}`);
      if (!res.ok) {
        console.error('Failed to fetch services', await res.text());
        return;
      }
      const json = await res.json();
      setServicesData({
        services: json.services ?? [],
        hasMore: json.hasMore ?? false,
        totalCount: json.totalCount ?? (json.services?.length ?? 0),
      });
    } catch (err) {
      console.error('Error fetching services', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewToggle = () => {
    const newView = viewMode === 'map' ? 'grid' : 'map';
    setViewMode(newView);

    const params = buildQueryFromFilters(filters, { view: newView });
    router.replace(`/services?${params.toString()}`);
  };

  const handleFiltersChange = (next: ServicesFilterState) => {
    setFilters(next);
    const params = buildQueryFromFilters(next, { page: '1' });
    router.replace(`/services?${params.toString()}`);
    fetchServices(next);
  };

  // We intentionally avoid re-syncing from initial props on every navigation,
  // so client-side filtering/fetching remains the source of truth.

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-100 border-b">
        <div className="container mx-auto px-4 py-6 md:py-12">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-3 md:mb-4">
              Find Trusted Local Services
            </h1>
            <p className="text-lg md:text-xl text-gray-600 mb-4 md:mb-6 leading-relaxed px-2">
              Connect with verified professionals in your area. From home cleaning to IT support,
              discover services you can trust with our comprehensive marketplace.
            </p>
            <div className="flex flex-wrap justify-center gap-3 md:gap-4 text-sm text-gray-500 px-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                <span>Verified Providers</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                <span>Secure Payments</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                <span>Quality Guarantee</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white border-b sticky top-0 z-40 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <ServicesSearchAndFilters filters={filters} onFiltersChange={handleFiltersChange} />
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Quick Stats */}
        <div className="mb-6 md:mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
            <div className="bg-white rounded-lg shadow-sm p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.totalServices}+</div>
              <div className="text-sm text-gray-600">Active Services</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{Math.round(stats.averageRating * 10)}%</div>
              <div className="text-sm text-gray-600">Satisfaction Rate</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-4 text-center">
              <div className="text-2xl font-bold text-purple-600">24/7</div>
              <div className="text-sm text-gray-600">Support Available</div>
            </div>
          </div>
        </div>

        {/* Mobile Filter Button */}
        <div className="lg:hidden mb-6">
          <div className="flex gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="flex-1">
                  <Filter className="w-4 h-4 mr-2" />
                  Filters
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80">
                <SheetHeader>
                  <SheetTitle>Advanced Filters</SheetTitle>
                </SheetHeader>
                <div className="mt-6">
                  <Suspense fallback={<div className="animate-pulse bg-gray-200 h-96 rounded-lg" />}>
                    <ServicesAdvancedFilters
                      searchParams={{
                        minPrice: filters.minPrice?.toString(),
                        maxPrice: filters.maxPrice?.toString(),
                        rating: filters.minRating?.toString(),
                        category: filters.categories[0],
                      }}
                      onFiltersChange={(next) => {
                        const merged = {
                          ...filters,
                          categories: next.categories ?? filters.categories,
                          minPrice: next.minPrice ?? filters.minPrice,
                          maxPrice: next.maxPrice ?? filters.maxPrice,
                          minRating: next.minRating ?? filters.minRating,
                        };
                        handleFiltersChange(merged);
                      }}
                    />
                  </Suspense>
                </div>
              </SheetContent>
            </Sheet>

            <Button
              variant={viewMode === 'map' ? 'default' : 'outline'}
              size="sm"
              onClick={handleViewToggle}
            >
              {viewMode === 'map' ? <Grid3X3 className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div className="flex gap-8">
          {/* Sidebar Filters - Hidden on mobile, shown on desktop */}
          <aside className="hidden lg:block w-80 flex-shrink-0">
            <div className="sticky top-32">
              <Suspense fallback={<div className="animate-pulse bg-gray-200 h-96 rounded-lg" />}>
                <ServicesAdvancedFilters
                  searchParams={{
                    minPrice: filters.minPrice?.toString(),
                    maxPrice: filters.maxPrice?.toString(),
                    rating: filters.minRating?.toString(),
                    category: filters.categories[0],
                  }}
                  onFiltersChange={(next) => {
                    const merged = {
                      ...filters,
                      categories: next.categories ?? filters.categories,
                      minPrice: next.minPrice ?? filters.minPrice,
                      maxPrice: next.maxPrice ?? filters.maxPrice,
                      minRating: next.minRating ?? filters.minRating,
                    };
                    handleFiltersChange(merged);
                  }}
                />
              </Suspense>
            </div>
          </aside>

          {/* Main Content Area */}
          <main className="flex-1 min-w-0">
            {viewMode === 'map' ? (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">
                    Services Near You
                  </h2>
                  <ServicesMap searchParams={initialParams} />
                </div>
              </div>
            ) : (
              <>
                {loading && (
                  <div className="mb-4 text-sm text-gray-500">Updating results9ed</div>
                )}
                <ServicesGridClient
                  services={servicesData.services}
                  searchParams={{
                    q: filters.search,
                    category: filters.categories[0],
                    minPrice: filters.minPrice?.toString(),
                    maxPrice: filters.maxPrice?.toString(),
                    rating: filters.minRating?.toString(),
                    sort: filters.sort,
                    view: viewMode,
                    page: '1',
                  }}
                  hasMore={servicesData.hasMore}
                  currentPage={1}
                />
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default ServicesPageClient;