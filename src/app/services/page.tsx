import { Metadata } from 'next';
import MarketingLayout from '../(marketing)/layout';
import { ServicesPageClient } from '@/components/services/services-page-client';

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
      <ServicesPageClient initialParams={params} />
    </MarketingLayout>
  );
}