import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, CheckCircle } from 'lucide-react';
import { db } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { formatPrice, getTrustBadge } from '@/lib/utils'; // Import shared helpers
import { providers } from '@/db/schema'; // Import schema for types

// This is now a Server Component. It fetches data on the server.

// Data fetching function
async function getServices() {
  // Re-fetch all services and join with their provider's details
  const allServices = await db.query.services.findMany({
    with: {
      provider: {
        columns: {
          handle: true,
          businessName: true,
          isVerified: true,
          trustLevel: true,
          status: true,
        },
      },
    },
  });

  // Filter to only show services from 'approved' providers
  return allServices.filter(service => service.provider.status === 'approved');
}

export default async function BrowseServicesPage() {
  // Fetch data directly on the server
  const services = await getServices();

  const renderContent = () => {
    if (services.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <Package className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold">No Services Found</h3>
          <p className="text-muted-foreground">
            No providers have listed any services yet. Check back soon!
          </p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {services.map((service) => (
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
                    {(() => {
                      const { Icon } = getTrustBadge(service.provider.trustLevel);
                      return <Icon className="h-4 w-4 mr-1" />;
                    })()}
                    <span className="capitalize">{service.provider.trustLevel}</span>
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
    <div className="container py-12">
      <h1 className="text-3xl font-bold mb-8">Browse All Services</h1>
      {/* TODO: Add search and filter controls here */}
      {renderContent()}
    </div>
  );
}

