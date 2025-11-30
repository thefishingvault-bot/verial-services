import { Suspense } from 'react';
import { Metadata } from 'next';
import MarketingLayout from '../(marketing)/layout';
import { ServicesSearchAndFilters } from '@/components/services/services-search-and-filters';
import { ServicesGrid } from '@/components/services/services-grid';
import { ServicesMap } from '@/components/services/services-map';
import { ServicesLoading } from '@/components/services/services-loading';

export const metadata: Metadata = {
  title: 'Find Local Services | Verial',
  description: 'Browse and book trusted local services in New Zealand. From cleaning and plumbing to IT support, find verified providers near you.',
};

interface SearchParams {
  q?: string;
  category?: string;
  location?: string;
  minPrice?: string;
  maxPrice?: string;
  rating?: string;
  availability?: string;
  sort?: string;
  view?: 'grid' | 'map';
}

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  return (
    <MarketingLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b">
          <div className="container mx-auto px-4 py-6">
            <div className="text-center">
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
                Find Trusted Local Services
              </h1>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Browse verified providers in your area. From cleaning and plumbing to IT support and accounting.
              </p>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white border-b sticky top-0 z-40 shadow-sm">
          <div className="container mx-auto px-4 py-4">
            <ServicesSearchAndFilters initialParams={params} />
          </div>
        </div>

        {/* Main Content */}
        <div className="container mx-auto px-4 py-8">
          <div className="flex gap-8">
            {/* Sidebar Filters - Hidden on mobile, shown on desktop */}
            <aside className="hidden lg:block w-80 flex-shrink-0">
              <div className="sticky top-32">
                <Suspense fallback={<div className="animate-pulse bg-gray-200 h-96 rounded-lg" />}>
                  {/* Advanced filters will go here */}
                </Suspense>
              </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 min-w-0">
              {params.view === 'map' ? (
                <div className="space-y-6">
                  <div className="bg-white rounded-lg shadow-sm p-6">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">
                      Services Near You
                    </h2>
                    <ServicesMap searchParams={params} />
                  </div>
                </div>
              ) : (
                <Suspense fallback={<ServicesLoading />}>
                  <ServicesGrid searchParams={params} />
                </Suspense>
              )}
            </main>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}