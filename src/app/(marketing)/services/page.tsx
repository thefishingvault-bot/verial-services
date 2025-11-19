import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, CheckCircle, Star } from 'lucide-react';
import { db } from '@/lib/db';
import { formatPrice, getTrustBadge } from '@/lib/utils';
import { services, serviceCategoryEnum, providers } from '@/db/schema';
import { desc, eq, and, ilike, or } from 'drizzle-orm';
import { ServiceFilters } from '@/components/services/service-filters';

// This is a Server Component.


// Data fetching function
async function getServices({ query, category }: { query?: string; category?: string }) {
  const isValidCategory = category
    ? (serviceCategoryEnum.enumValues as readonly string[]).includes(category)
    : false;

  const conditions = [
    eq(providers.status, 'approved'), // Always filter for approved providers

    // Category Filter
    isValidCategory ? eq(services.category, category as any) : undefined,

    // Search Filter (Full-Text: Title OR Description OR Business Name)
    query
      ? or(
          ilike(services.title, `%${query}%`),
          ilike(services.description, `%${query}%`),
          ilike(providers.businessName, `%${query}%`),
        )
      : undefined,
  ];

  const rows = await db
    .select({
      service: services,
      provider: providers,
    })
    .from(services)
    .leftJoin(providers, eq(services.providerId, providers.id))
    .where(and(...(conditions.filter(Boolean) as any[])))
    .orderBy(desc(services.createdAt));

  const processed = rows.map(({ service, provider }) => {
    const ratings = (provider?.reviews ?? []).map((r) => r.rating).filter((r) => typeof r === 'number');
    const avgRating =
      ratings.length > 0
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : 0;

    return {
      ...service,
      provider,
      avgRating,
      reviewCount: ratings.length,
    };
  });

  return processed;
}

export default async function BrowseServicesPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; category?: string }>;
}) {
  const params = await searchParams;
  const query = params?.q;
  const category = params?.category;

  const allServices = await getServices({ query, category });

  // Create a dynamic title
  let title = 'Browse All Services';
  if (query) {
    title = `Results for "${query}"`;
  } else if (category) {
    title = `Services in "${category}"`;
  }

  const renderContent = () => {
    if (allServices.length === 0) {
      let emptyMessage = 'No providers have listed any services yet.';
      if (query) {
        emptyMessage = `We couldn't find any services matching "${query}".`;
      } else if (category) {
        emptyMessage = `We couldn't find any services in the "${category}" category.`;
      }

      return (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <Package className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold">No Services Found</h3>
          <p className="text-muted-foreground">{emptyMessage}</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {allServices.map((service) => (
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
                <Badge variant="outline" className="mb-2 capitalize">{service.category}</Badge>
                <h3 className="font-semibold text-lg line-clamp-1" title={service.title}>{service.title}</h3>
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
                      const { Icon } = getTrustBadge(service.provider.trustLevel);
                      return <Icon className="h-4 w-4 mr-1" />;
                    })()}
                    {service.provider.isVerified && (
                      <CheckCircle className="h-3 w-3 ml-1 text-green-500" />
                    )}
                  </div>
                </div>
              </CardFooter>
            </Card>
          </Link>
        ))}
      </div>
    );
  };

  return (
    <div className="container mx-auto py-12">
      <h1 className="text-3xl font-bold mb-8 capitalize">
        {title}
      </h1>
      <ServiceFilters />
      {renderContent()}
    </div>
  );
}

