import { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import MarketingLayout from '../(marketing)/layout';
import ServicesPageShell from '../../components/services/services-page-shell';
import {
  getServicesDataFromSearchParams,
  type ServicesSearchParams,
} from '@/lib/services-data';

export const metadata: Metadata = {
  title: 'Find Local Services | Verial',
  description: 'Browse and book trusted local services in New Zealand. From cleaning and plumbing to IT support, find verified providers near you.',
};

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<ServicesSearchParams>;
}) {
  const { userId } = await auth();
  const resolvedSearchParams = await searchParams;
  const data = await getServicesDataFromSearchParams(resolvedSearchParams, userId);

  return (
    <MarketingLayout>
      <ServicesPageShell
        filters={data.filters}
        services={data.services}
        totalCount={data.totalCount}
        hasMore={data.hasMore}
        kpi={data.kpi}
      />
    </MarketingLayout>
  );
}