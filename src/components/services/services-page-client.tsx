'use client';

import { useState } from 'react';
import { MapPin, Grid3X3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';
import ServicesSearchAndFilters from '@/components/services/services-search-and-filters';
import { ServicesGridClient } from '@/components/services/services-grid-client';
import { ServicesMap } from '@/components/services/services-map';
// NOTE: Advanced sidebar filters are currently disabled on the services page.
import type { ServiceWithProviderAndFavorite, ServicesFilters } from '@/lib/services-data';

interface ServicesPageClientProps {
  initialFilters: ServicesFilters;
  initialServicesData: {
    services: ServiceWithProviderAndFavorite[];
    hasMore: boolean;
    totalCount: number;
  };
  stats: {
    totalServices: number;
    averageRating: number;
  };
}

const ServicesPageClient = ({ initialFilters, initialServicesData, stats }: ServicesPageClientProps) => {
  const [filters, setFilters] = useState<ServicesFilters>(initialFilters);
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [loading] = useState(false);

  // Temporarily disable dynamic filtering logic; keep initial SSR data only.
  const handleViewToggle = () => {
    const newView = viewMode === 'map' ? 'grid' : 'map';
    setViewMode(newView);
  };

  const handleFiltersChange = (next: ServicesFilters) => {
    setFilters(next);
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
      <div className="relative border-b shadow-sm md:sticky md:top-24 md:self-start md:bg-background md:z-10">
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

        {/* View toggle only (advanced filters removed) */}
        <div className="lg:hidden mb-6 flex justify-end">
          <Button
            variant={viewMode === 'map' ? 'default' : 'outline'}
            size="sm"
            onClick={handleViewToggle}
          >
            {viewMode === 'map' ? <Grid3X3 className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
          </Button>
        </div>

        <div className="flex gap-8">
          {/* Advanced sidebar filters removed */}

          {/* Main Content Area */}
          <main className="flex-1 min-w-0">
            {viewMode === 'map' ? (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">
                    Services Near You
                  </h2>
                  <ServicesMap />
                </div>
              </div>
            ) : (
              <>
                {loading && (
                  <div className="mb-4 text-sm text-gray-500">Updating results9ed</div>
                )}
                <ServicesGridClient
                  services={initialServicesData.services}
                  searchParams={{}}
                  hasMore={initialServicesData.hasMore}
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