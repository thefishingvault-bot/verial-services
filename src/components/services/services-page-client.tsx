'use client';

import { useState, Suspense } from 'react';
import { Filter, MapPin, Grid3X3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { CheckCircle } from 'lucide-react';
import { ServicesSearchAndFilters } from '@/components/services/services-search-and-filters';
import { ServicesGridClient } from '@/components/services/services-grid-client';
import { ServicesMap } from '@/components/services/services-map';
import { ServicesLoading } from '@/components/services/services-loading';
import { ServicesAdvancedFilters } from '@/components/services/services-advanced-filters';
import { ServiceWithProvider, SearchParams } from '@/lib/services-data';

interface SearchParamsWithPage extends SearchParams {
  page?: string;
}

interface ServicesPageClientProps {
  initialParams: SearchParams;
  initialServicesData: {
    services: ServiceWithProvider[];
    hasMore: boolean;
    totalCount: number;
  };
  stats: {
    totalServices: number;
    averageRating: number;
  };
}

export function ServicesPageClient({ initialParams, initialServicesData, stats }: ServicesPageClientProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'map'>(initialParams.view || 'grid');
  const [servicesData, setServicesData] = useState(initialServicesData);

  const handleViewToggle = () => {
    const newView = viewMode === 'map' ? 'grid' : 'map';
    setViewMode(newView);

    const newParams = new URLSearchParams();
    Object.entries(initialParams).forEach(([key, value]) => {
      if (value !== undefined) {
        newParams.set(key, value);
      }
    });
    newParams.set('view', newView);
    window.location.href = `/services?${newParams.toString()}`;
  };

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
          <ServicesSearchAndFilters initialParams={initialParams} />
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
                    <ServicesAdvancedFilters searchParams={initialParams} />
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
                <ServicesAdvancedFilters searchParams={initialParams} />
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
              <ServicesGridClient
                services={servicesData.services}
                searchParams={initialParams}
                hasMore={servicesData.hasMore}
                currentPage={parseInt(initialParams.page || '1')}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}