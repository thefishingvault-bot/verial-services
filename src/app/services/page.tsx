import { Metadata } from 'next';
import MarketingLayout from '../(marketing)/layout';
import ServicesPageClient from '@/components/services/services-page-client';
import { getServicesData, getServicesStats } from '@/lib/services-data';

type ServicesFilterState = {
  categories: string[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  trustLevels: string[];
  search?: string;
  sort?: string;
};

function parseServicesSearchParams(searchParams: Record<string, string | string[] | undefined>): ServicesFilterState {
  return {
    categories: typeof searchParams.categories === 'string' && searchParams.categories.length > 0
      ? searchParams.categories.split(',')
      : [],
    minPrice: searchParams.minPrice ? Number(searchParams.minPrice) : undefined,
    maxPrice: searchParams.maxPrice ? Number(searchParams.maxPrice) : undefined,
    minRating: searchParams.minRating ? Number(searchParams.minRating) : undefined,
    trustLevels: typeof searchParams.trustLevels === 'string' && searchParams.trustLevels.length > 0
      ? searchParams.trustLevels.split(',')
      : [],
    search: typeof searchParams.q === 'string' ? searchParams.q : undefined,
    sort: typeof searchParams.sort === 'string' ? searchParams.sort : undefined,
  };
}

export const metadata: Metadata = {
  title: 'Find Local Services | Verial',
  description: 'Browse and book trusted local services in New Zealand. From cleaning and plumbing to IT support, find verified providers near you.',
};

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseServicesSearchParams(params);
  const initialServicesData = await getServicesData({ filters });
  const stats = await getServicesStats();

  return (
    <MarketingLayout>
      <ServicesPageClient
        initialFilters={filters}
        initialServicesData={initialServicesData}
        stats={stats}
        initialParams={Object.fromEntries(
          Object.entries(params).map(([key, value]) => [
            key,
            Array.isArray(value) ? value[0] : value || ''
          ])
        )}
      />
    </MarketingLayout>
  );
}