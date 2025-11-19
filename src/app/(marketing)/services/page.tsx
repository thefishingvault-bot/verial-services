import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, CheckCircle } from 'lucide-react';
import { db } from '@/lib/db';
import { formatPrice, getTrustBadge } from '@/lib/utils';
import { services, providers, serviceCategoryEnum } from '@/db/schema'; // Import enum
import { eq, and, ilike, desc, or } from 'drizzle-orm';
import { ServiceFilters } from '@/components/services/service-filters';

// This is a Server Component.


// Valid service category type
type ServiceCategory = (typeof serviceCategoryEnum.enumValues)[number];

// Data fetching function
async function getServices({ query, category }: { query?: string, category?: string }) {

  // Build the 'where' clause dynamically
  const conditions = [
    eq(providers.status, 'approved'), // Provider must be approved
    (category && serviceCategoryEnum.enumValues.includes(category as ServiceCategory))
      ? eq(services.category, category as ServiceCategory) // Category must match
      : undefined,
    query
      ? or(
          ilike(services.title, `%${query}%`),
          ilike(services.description, `%${query}%`),
          ilike(providers.businessName, `%${query}%`),
        ) // Search query must match one of these fields
      : undefined,
  ];

  const allServices = await db.select({
    id: services.id,
    title: services.title,
    slug: services.slug,
    priceInCents: services.priceInCents,
    category: services.category,
    coverImageUrl: services.coverImageUrl,
    provider: {
      handle: providers.handle,
      businessName: providers.businessName,
      isVerified: providers.isVerified,
      trustLevel: providers.trustLevel,
    }
  })
  .from(services)
  .innerJoin(providers, eq(services.providerId, providers.id)) // Use innerJoin to ensure provider is not null
  .where(and(...conditions.filter(Boolean))) // Filter out undefined
  .orderBy(desc(services.createdAt));

  return allServices;
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
                <h3 className="font-semibold text-lg">{service.title}</h3>
              </CardContent>
              <CardFooter className="p-4 pt-0 flex flex-col items-start">
                <p className="font-bold text-xl mb-2">{formatPrice(service.priceInCents)}</p>
                <div className="text-sm text-muted-foreground">
                  <p className="truncate">{service.provider.businessName}</p>
                  <div className="flex items-center">
                    {service.provider.trustLevel && (() => {
                      const { Icon } = getTrustBadge(service.provider.trustLevel);
                      return <Icon className="h-4 w-4 mr-1" />;
                    })()}
                    {service.provider.trustLevel && <span className="capitalize">{service.provider.trustLevel}</span>}
                    {service.provider.isVerified && <CheckCircle className="h-4 w-4 ml-2 text-green-500" />}
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

