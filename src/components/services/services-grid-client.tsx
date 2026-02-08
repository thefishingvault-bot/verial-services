"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Star,
  Clock,
  CheckCircle,
  DollarSign,
  Search,
} from "lucide-react";
import { LoadMoreButton } from "./load-more-button";
import { FavoriteToggle } from "@/components/services/favorite-toggle";
import type { ServiceWithProviderAndFavorite } from "@/lib/services-data";
import { ContactButton } from "@/components/common/contact-button";
import { formatServicePriceLabel } from "@/lib/pricing";

const categoryMap: Record<string, string> = {
  cleaning: 'Cleaning',
  plumbing: 'Plumbing',
  gardening: 'Gardening',
  it_support: 'IT Support',
  accounting: 'Accounting',
  detailing: 'Detailing',
  electrical: 'Electrical',
  painting: 'Painting',
  landscaping: 'Landscaping',
  handyman: 'Handyman',
};

function getCategoryDisplayName(category: string) {
  return categoryMap[category] || category;
}

function getTrustScoreColor(score: number) {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
}

function getTrustScoreLabel(score: number) {
  if (score >= 80) return 'Trusted';
  if (score >= 60) return 'Good';
  return 'New';
}

interface ServicesGridClientProps {
  services: ServiceWithProviderAndFavorite[];
  searchParams: {
    q?: string;
    category?: string;
    region?: string;
    minPrice?: string;
    maxPrice?: string;
    rating?: string;
    sort?: string;
    page?: string;
    pageSize?: string;
  };
  hasMore: boolean;
  currentPage: number;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

export function ServicesGridClient({
  services,
  searchParams,
  hasMore,
  currentPage,
  isLoading,
  isLoadingMore,
  onLoadMore,
}: ServicesGridClientProps) {
  const [items, setItems] = useState<ServiceWithProviderAndFavorite[]>(services);

  useEffect(() => {
    setItems(services);
  }, [services]);

  const sortedItems = useMemo(() => {
    // IMPORTANT: For sort=relevance we must preserve server/DB ordering (planRank + relevance)
    // so paid tiers affect page 1 deterministically.
    if (searchParams.sort === "relevance") return items;

    // For other sorts, keep the existing UX of pinning user favorites first.
    return [...items].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));
  }, [items, searchParams.sort]);

  const handleFavoriteChange = (serviceId: string, next: boolean) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === serviceId
          ? { ...item, isFavorite: next }
          : item,
      ),
    );
  };

  if (isLoading && services.length === 0) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Loading services…</h3>
        <p className="text-gray-600">Please wait a moment.</p>
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 mb-4">
          <Search className="h-12 w-12 mx-auto" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No services found</h3>
        <p className="text-gray-600 mb-6">
          Try adjusting your search criteria or browse all services.
        </p>
        <Link href="/services">
          <Button variant="outline">Browse All Services</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedItems.map((service) => (
          <Card key={service.id} className="group py-0 gap-0 overflow-hidden hover:shadow-lg transition-shadow duration-200">
            <CardHeader className="p-0">
              {/* Service Image */}
              <div className="relative aspect-video bg-gray-100 rounded-t-lg overflow-hidden">
                {service.coverImageUrl ? (
                  <Image
                    src={service.coverImageUrl}
                    alt={service.title}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-200"
                    priority={false}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <DollarSign className="h-8 w-8" />
                  </div>
                )}

                {/* Favorite Button */}
                <FavoriteToggle
                  serviceId={service.id}
                  initialIsFavorite={service.isFavorite}
                  initialCount={service.favoriteCount}
                  showCount
                  onToggleOptimistic={(next) => handleFavoriteChange(service.id, next)}
                />

                {/* Category Badge */}
                <div className="absolute top-3 left-3">
                  <Badge variant="secondary" className="bg-white/90 text-gray-900">
                    {getCategoryDisplayName(service.category)}
                  </Badge>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-4">
              {/* Service Title and Price */}
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-blue-600 transition-colors">
                  <Link href={`/s/${service.slug}`}>
                    {service.title}
                  </Link>
                </h3>
                <div className="text-right ml-2">
                  <div className="text-lg font-bold text-gray-900">
                    {formatServicePriceLabel({
                      pricingType: service.pricingType,
                      priceInCents: service.priceInCents,
                    })}
                  </div>
                  {service.pricingType !== 'quote' && (
                    <div className="text-xs text-gray-500">per hour</div>
                  )}
                </div>
              </div>

              {/* Provider Info */}
              <div className="flex items-center gap-3 mb-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={service.provider.avatarUrl || undefined} />
                  <AvatarFallback>
                    {service.provider.businessName?.charAt(0).toUpperCase() || 'P'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {service.provider.businessName}
                    </span>
                    {service.provider.isVerified && (
                      <CheckCircle className="h-4 w-4 text-blue-500 shrink-0" />
                    )}
                    {service.provider.planBadge ? (
                      <Badge variant="outline" className="ml-1 h-5 px-2 text-[10px] leading-4">
                        {service.provider.planBadge === "elite" ? "Elite" : "Pro"}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className={`font-medium ${getTrustScoreColor(service.provider.trustScore)}`}>
                      {getTrustScoreLabel(service.provider.trustScore)}
                    </span>
                    {service.provider.averageResponseTime && (
                      <>
                        <span>•</span>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{service.provider.averageResponseTime}</span>
                        </div>
                      </>
                    )}
                    {service.provider.suburb || service.provider.region ? (
                      <>
                        <span>•</span>
                        <span>
                          {service.provider.suburb}
                          {service.provider.suburb && service.provider.region ? ", " : ""}
                          {service.provider.region}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Rating and Reviews */}
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="text-sm font-medium text-gray-900">
                    {service.avgRating?.toFixed(1) || 'N/A'}
                  </span>
                </div>
                <span className="text-sm text-gray-500">
                  ({service.reviewCount} review{service.reviewCount !== 1 ? 's' : ''})
                </span>
              </div>

              {/* Service Description */}
              <p className="text-sm text-gray-600 line-clamp-2 mb-4">
                {service.description}
              </p>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Link href={`/s/${service.slug}`} className="flex-1">
                  <Button className="w-full" size="sm">
                    View Details
                  </Button>
                </Link>
                <ContactButton
                  providerId={service.provider.id}
                  serviceId={service.id}
                  variant="outline"
                  iconOnly
                  ariaLabel="Message Provider"
                  className="shrink-0"
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Load More Button */}
      <LoadMoreButton
        searchParams={searchParams}
        currentPage={currentPage}
        hasMore={hasMore}
        onLoadMore={onLoadMore}
        isLoading={isLoadingMore}
      />
    </div>
  );
}