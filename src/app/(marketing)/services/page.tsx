import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, Star } from 'lucide-react';
import { db } from '@/lib/db';
import { formatPrice, getTrustBadge } from '@/lib/utils';
import { services, providers, reviews, serviceCategoryEnum } from '@/db/schema';
import { eq, and, ilike, desc, or, inArray } from 'drizzle-orm';
import { ServiceFilters } from '@/components/services/service-filters';

// Helper type for our result (aligned to the selected fields below)
type ServiceWithProvider = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  priceInCents: number;
  category: (typeof serviceCategoryEnum.enumValues)[number];
  coverImageUrl: string | null;
  createdAt: Date;
  provider: {
    id: string;
    handle: string | null;
    businessName: string | null;
    isVerified: boolean;
    trustLevel: 'bronze' | 'silver' | 'gold' | 'platinum' | null;
  };
  avgRating: number;
  reviewCount: number;
};

async function getServices({ query, category }: { query?: string; category?: string }) {
  const isValidCategory = category
    ? (serviceCategoryEnum.enumValues as readonly string[]).includes(category as any)
    : false;

  // 1. Build the SQL Conditions
  const searchCondition = query
    ? or(
        ilike(services.title, `%${query}%`),
        ilike(services.description, `%${query}%`),
        ilike(providers.businessName, `%${query}%`),
      )
    : undefined;

  const categoryCondition = isValidCategory && category ? eq(services.category, category as any) : undefined;

  const conditions = [
    eq(providers.status, 'approved'), // Only approved providers
    categoryCondition,
    searchCondition,
  ].filter((c): c is NonNullable<typeof c> => !!c);

  // 2. Main Query: Fetch Services + Providers
  const serviceResults = await db
    .select({
      // Service fields
      id: services.id,
      title: services.title,
      slug: services.slug,
      description: services.description,
      priceInCents: services.priceInCents,
      category: services.category,
      coverImageUrl: services.coverImageUrl,
      createdAt: services.createdAt,
      updatedAt: services.updatedAt,
      chargesGst: services.chargesGst,
      // Provider fields
      providerId: providers.id,
      providerHandle: providers.handle,
      providerName: providers.businessName,
      providerVerified: providers.isVerified,
      providerTrust: providers.trustLevel,
    })
    .from(services)
    .leftJoin(providers, eq(services.providerId, providers.id))
    .where(and(...conditions))
    .orderBy(desc(services.createdAt));

  // 3. Fetch Reviews for these providers to calculate ratings
  const providerIds = [...new Set(serviceResults.map((s) => s.providerId))].filter(Boolean) as string[];

  const reviewMap: Record<string, { total: number; count: number }> = {};

  if (providerIds.length > 0) {
    const reviewData = await db
      .select({
        providerId: reviews.providerId,
        rating: reviews.rating,
      })
      .from(reviews)
      .where(inArray(reviews.providerId, providerIds));

    reviewData.forEach((r) => 
      {
        const key = String(r.providerId);
        if (!reviewMap[key]) {
          reviewMap[key] = { total: 0, count: 0 };
        }
        reviewMap[key].total += r.rating ?? 0;
        reviewMap[key].count += 1;
      },
    );
  }

  // 4. Merge and Format
  return serviceResults.map<ServiceWithProvider>((s) => {
    const key = String(s.providerId);
    const stats = reviewMap[key] || { total: 0, count: 0 };
    const avgRating = stats.count > 0 ? stats.total / stats.count : 0;

    return {
      id: s.id,
      title: s.title,
      slug: s.slug,
      description: s.description,
      priceInCents: s.priceInCents,
      category: s.category as ServiceWithProvider['category'],
      coverImageUrl: s.coverImageUrl,
      createdAt: s.createdAt,
      provider: {
        id: s.providerId!,
        handle: s.providerHandle,
        businessName: s.providerName,
        isVerified: s.providerVerified ?? false,
        trustLevel: (s.providerTrust ?? 'bronze') as ServiceWithProvider['provider']['trustLevel'],
      },
      avgRating,
      reviewCount: stats.count,
    };
  });
}

export default async function BrowseServicesPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; category?: string }>;
}) {
  const resolvedParams = await searchParams;
  const query = resolvedParams?.q?.toLowerCase();
  const category = resolvedParams?.category;

  const servicesList = await getServices({ query, category });

  let title = 'Browse All Services';
  if (query) title = `Results for "${query}"`;
  else if (category) title = `Services in "${category}"`;

  return (
    <div className="container mx-auto py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold capitalize mb-6">{title}</h1>
        <ServiceFilters />
      </div>

      {servicesList.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <Package className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold">No Services Found</h3>
          <p className="text-muted-foreground">No services match your criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {servicesList.map((service) => (
            <Link href={`/s/${service.slug}`} key={service.id}>
              <Card className="h-full flex flex-col overflow-hidden transition-shadow hover:shadow-lg">
                <CardHeader className="p-0">
                  <div className="relative w-full aspect-video bg-gray-200">
                    {service.coverImageUrl ? (
                      <Image
                        src={service.coverImageUrl}
                        alt={service.title}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <span className="text-sm text-gray-500">No Image</span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-4 flex-grow">
                  <Badge variant="outline" className="mb-2 capitalize">
                    {service.category}
                  </Badge>
                  <h3 className="font-semibold text-lg line-clamp-1" title={service.title}>
                    {service.title}
                  </h3>
                </CardContent>
                <CardFooter className="p-4 pt-0 flex flex-col items-start gap-2">
                  <div className="flex items-center w-full justify-between">
                    <p className="font-bold text-xl">{formatPrice(service.priceInCents)}</p>
                    {service.reviewCount > 0 && (
                      <div className="flex items-center gap-1 text-sm font-medium">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span>{service.avgRating.toFixed(1)}</span>
                        <span className="text-muted-foreground">({service.reviewCount})</span>
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground w-full flex justify-between items-center">
                    <span className="truncate max-w-[120px]">{service.provider.businessName}</span>
                    <div className="flex items-center">
                      {(() => {
                        const { Icon } = getTrustBadge(
                          (service.provider.trustLevel ?? 'bronze') as 'bronze' | 'silver' | 'gold' | 'platinum',
                        );
                        return <Icon className="h-4 w-4 mr-1" />;
                      })()}
                    </div>
                  </div>
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

