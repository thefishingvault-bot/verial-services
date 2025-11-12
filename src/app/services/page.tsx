'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, Package, CheckCircle, Shield, Award, Gem } from 'lucide-react';

// Define a type for our joined service/provider data
interface Service {
  id: string;
  title: string;
  slug: string;
  priceInCents: number;
  category: string;
  coverImageUrl: string | null;
  provider: {
    handle: string;
    businessName: string;
    isVerified: boolean;
    trustLevel: 'bronze' | 'silver' | 'gold' | 'platinum';
  };
}

// Helper to format currency
const formatPrice = (priceInCents: number) => {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
  }).format(priceInCents / 100);
};

// Helper to get Trust Badge icon and color
const getTrustBadge = (level: Service['provider']['trustLevel']) => {
  switch (level) {
    case 'platinum':
      return { icon: <Gem className="h-4 w-4 mr-1" />, color: 'text-blue-500' };
    case 'gold':
      return { icon: <Award className="h-4 w-4 mr-1" />, color: 'text-yellow-500' };
    case 'silver':
      return { icon: <Shield className="h-4 w-4 mr-1" />, color: 'text-gray-500' };
    default:
      return { icon: <Shield className="h-4 w-4 mr-1" />, color: 'text-yellow-800' };
  }
};

export default function BrowseServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/services/list')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch services.');
        return res.json();
      })
      .then((data) => {
        setServices(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, []);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center p-12 text-destructive">
          <AlertTriangle className="h-8 w-8 mr-2" />
          <p>{error}</p>
        </div>
      );
    }

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
                    {getTrustBadge(service.provider.trustLevel).icon}
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

