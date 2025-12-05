'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Star, MapPin, DollarSign } from 'lucide-react';
import Link from 'next/link';

interface ServiceLocation {
  id: string;
  title: string;
  pricePerHour: number;
  category: string;
  provider: {
    businessName: string;
    handle: string;
    avatarUrl: string | null;
    trustScore: number;
    isVerified: boolean;
  };
  avgRating: number;
  reviewCount: number;
  lat: number;
  lng: number;
}

// Mock data for demonstration - in production this would come from the database
const mockServices: ServiceLocation[] = [
  {
    id: '1',
    title: 'Professional Window Cleaning',
    pricePerHour: 45,
    category: 'cleaning',
    provider: {
      businessName: 'Sparkle Clean',
      handle: 'sparkleclean',
      avatarUrl: null,
      trustScore: 85,
      isVerified: true,
    },
    avgRating: 4.8,
    reviewCount: 24,
    lat: -36.8485,
    lng: 174.7633, // Auckland CBD
  },
  {
    id: '2',
    title: 'Garden Maintenance',
    pricePerHour: 35,
    category: 'gardening',
    provider: {
      businessName: 'Green Thumb Gardens',
      handle: 'greenthumb',
      avatarUrl: null,
      trustScore: 78,
      isVerified: true,
    },
    avgRating: 4.6,
    reviewCount: 18,
    lat: -36.8500,
    lng: 174.7700, // Near Auckland CBD
  },
  {
    id: '3',
    title: 'IT Support & Setup',
    pricePerHour: 65,
    category: 'it_support',
    provider: {
      businessName: 'TechFix Solutions',
      handle: 'techfix',
      avatarUrl: null,
      trustScore: 92,
      isVerified: true,
    },
    avgRating: 4.9,
    reviewCount: 31,
    lat: -36.8400,
    lng: 174.7600, // Auckland CBD area
  },
];

export function ServicesMap() {
  const [selectedService, setSelectedService] = useState<ServiceLocation | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Mock map loading - in production, this would integrate with Google Maps or similar
  useEffect(() => {
    // Simulate map loading
    const timer = setTimeout(() => {
      setMapLoaded(true);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  if (!mapLoaded) {
    return (
      <div className="h-96 bg-gray-100 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-gray-600">Loading map...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Map Container */}
      <div className="relative h-96 bg-gray-100 rounded-lg overflow-hidden">
        {/* Mock Map Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-100 to-green-100">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <MapPin className="h-12 w-12 mx-auto mb-2" />
              <p className="text-sm">Interactive Map View</p>
              <p className="text-xs">Showing {mockServices.length} services in Auckland</p>
            </div>
          </div>
        </div>

        {/* Service Markers (Mock) */}
        {mockServices.map((service, index) => (
          <div
            key={service.id}
            className="absolute cursor-pointer transform -translate-x-1/2 -translate-y-full"
            style={{
              left: `${20 + index * 25}%`,
              top: `${30 + index * 15}%`,
            }}
            onClick={() => setSelectedService(service)}
          >
            <div className="bg-white rounded-full p-2 shadow-lg border-2 border-blue-500 hover:border-blue-700 transition-colors">
              <DollarSign className="h-4 w-4 text-blue-600" />
            </div>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1">
              <div className="bg-white px-2 py-1 rounded shadow text-xs font-medium whitespace-nowrap">
                ${service.pricePerHour}/hr
              </div>
            </div>
          </div>
        ))}

        {/* Selected Service Popup */}
        {selectedService && (
          <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80">
            <Card className="shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={selectedService.provider.avatarUrl || undefined} />
                    <AvatarFallback>
                      {selectedService.provider.businessName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {selectedService.title}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {selectedService.provider.businessName}
                    </p>

                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span className="text-sm font-medium">
                          {selectedService.avgRating}
                        </span>
                      </div>
                      <span className="text-sm text-gray-500">
                        (${selectedService.pricePerHour}/hr)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <Link href={`/s/${selectedService.id}`} className="flex-1">
                    <Button size="sm" className="w-full">
                      View Details
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedService(null)}
                  >
                    Close
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Map Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>{mockServices.length} services shown</span>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <span>Available services</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            Use My Location
          </Button>
          <Button variant="outline" size="sm">
            Filter by Distance
          </Button>
        </div>
      </div>

      {/* Service List Below Map */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockServices.map((service) => (
          <Card
            key={service.id}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setSelectedService(service)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={service.provider.avatarUrl || undefined} />
                  <AvatarFallback>
                    {service.provider.businessName.charAt(0)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-900 truncate">
                    {service.title}
                  </h4>
                  <p className="text-sm text-gray-600 truncate">
                    {service.provider.businessName}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      <span className="text-xs font-medium">
                        {service.avgRating}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">
                      ${service.pricePerHour}/hr
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}