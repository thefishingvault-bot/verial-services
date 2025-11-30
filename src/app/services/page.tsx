import { Metadata } from 'next';
import MarketingLayout from '../(marketing)/layout';
import { ServicesPageClient } from '@/components/services/services-page-client';
import { getServicesData, getServicesStats, SearchParams } from '@/lib/services-data';

export const metadata: Metadata = {
  title: 'Find Local Services | Verial',
  description: 'Browse and book trusted local services in New Zealand. From cleaning and plumbing to IT support, find verified providers near you.',
};

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  // Validate category to match ServiceCategory type
  const validCategories = [
    "cleaning",
    "plumbing",
    "gardening",
    "it_support",
    "accounting",
    "detailing",
    "other",
  ];
  const safeParams = {
    ...params,
    category: params.category && validCategories.includes(params.category)
      ? (params.category as import("@/lib/services-data").ServiceCategory)
      : undefined,
  };
  const initialServicesData = await getServicesData(safeParams);
  const stats = await getServicesStats();

  return (
    <MarketingLayout>
      <ServicesPageClient
        initialParams={params}
        initialServicesData={initialServicesData}
        stats={stats}
      />
    </MarketingLayout>
  );
}