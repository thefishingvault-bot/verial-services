import { db } from '@/lib/db';
import { services, providers, users } from '@/db/schema';
import { eq, and, or, like, sql, desc, asc, gte, lte } from 'drizzle-orm';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Star,
  MapPin,
  Clock,
  CheckCircle,
  MessageCircle,
  Heart,
  DollarSign,
  Search
} from 'lucide-react';
import { LoadMoreButton } from './load-more-button';

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
  page?: string;
}

interface ServiceWithProvider {
  id: string;
  title: string;
  description: string | null;
  priceInCents: number;
  category: string;
  coverImageUrl: string | null;
  createdAt: Date;
  provider: {
    id: string;
    businessName: string | null;
    handle: string | null;
    baseSuburb: string | null;
    baseRegion: string | null;
    trustScore: number;
    isVerified: boolean;
    avatarUrl: string | null;
  };
  user: {
    firstName: string | null;
    lastName: string | null;
  };
  avgRating: number;
  reviewCount: number;
  distance?: number; // Would be calculated based on user location
}

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

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
  }).format(price);
}

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

export async function ServicesGrid({ searchParams }: { searchParams: SearchParams }) {
  // Build the query based on search parameters
  const whereConditions = [eq(providers.status, 'approved')];

  // Text search
  if (searchParams.q) {
    whereConditions.push(
      or(
        like(services.title, `%${searchParams.q}%`),
        like(services.description, `%${searchParams.q}%`),
        like(providers.businessName, `%${searchParams.q}%`)
      )!
    );
  }

  // Category filter
  if (searchParams.category) {
    whereConditions.push(eq(services.category, searchParams.category as any));
  }

  // Location filter (simplified - would need geocoding in production)
  if (searchParams.location) {
    whereConditions.push(
      or(
        like(providers.baseSuburb, `%${searchParams.location}%`),
        like(providers.baseRegion, `%${searchParams.location}%`)
      )!
    );
  }

  // Price range filter
  if (searchParams.minPrice) {
    whereConditions.push(gte(services.priceInCents, parseInt(searchParams.minPrice) * 100));
  }
  if (searchParams.maxPrice) {
    whereConditions.push(lte(services.priceInCents, parseInt(searchParams.maxPrice) * 100));
  }

  // Build order by
  let orderBy = desc(services.createdAt);
  switch (searchParams.sort) {
    case 'rating':
      // This would need a proper join with reviews table
      orderBy = desc(sql`COALESCE(avg_rating, 0)`);
      break;
    case 'price_low':
      orderBy = asc(services.priceInCents);
      break;
    case 'price_high':
      orderBy = desc(services.priceInCents);
      break;
    case 'newest':
      orderBy = desc(services.createdAt);
      break;
    case 'relevance':
    default:
      orderBy = desc(services.createdAt);
      break;
  }

  const page = parseInt(searchParams.page || '1');
  const limit = 12; // Show 12 services per page
  const offset = (page - 1) * limit;

  // Fetch services with provider info
  const servicesData = await db
    .select({
      id: services.id,
      title: services.title,
      description: services.description,
      priceInCents: services.priceInCents,
      category: services.category,
      coverImageUrl: services.coverImageUrl,
      createdAt: services.createdAt,
      providerId: services.providerId,
      businessName: providers.businessName,
      handle: providers.handle,
      baseSuburb: providers.baseSuburb,
      baseRegion: providers.baseRegion,
      trustScore: providers.trustScore,
      isVerified: providers.isVerified,
      avatarUrl: users.avatarUrl,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(services)
    .innerJoin(providers, eq(services.providerId, providers.id))
    .innerJoin(users, eq(providers.userId, users.id))
    .where(and(...whereConditions))
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  // Transform data and add mock ratings (in production, this would come from reviews table)
  const servicesWithProviders: ServiceWithProvider[] = servicesData.map(service => ({
    id: service.id,
    title: service.title,
    description: service.description,
    priceInCents: service.priceInCents,
    category: service.category,
    coverImageUrl: service.coverImageUrl,
    createdAt: service.createdAt,
    provider: {
      id: service.providerId,
      businessName: service.businessName,
      handle: service.handle,
      baseSuburb: service.baseSuburb,
      baseRegion: service.baseRegion,
      trustScore: service.trustScore,
      isVerified: service.isVerified,
      avatarUrl: service.avatarUrl,
    },
    user: {
      firstName: service.firstName,
      lastName: service.lastName,
    },
    avgRating: Math.random() * 2 + 3, // Mock rating between 3-5
    reviewCount: Math.floor(Math.random() * 50) + 1, // Mock review count
  }));

  if (servicesWithProviders.length === 0) {
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
      {/* Results Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {servicesWithProviders.length} service{servicesWithProviders.length !== 1 ? 's' : ''} found
          </h2>
          {searchParams.q && (
            <p className="text-sm text-gray-600 mt-1">
              Results for "{searchParams.q}"
            </p>
          )}
        </div>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {servicesWithProviders.map((service) => (
          <Card key={service.id} className="group hover:shadow-lg transition-shadow duration-200">
            <CardHeader className="p-0">
              {/* Service Image */}
              <div className="relative aspect-video bg-gray-100 rounded-t-lg overflow-hidden">
                {service.coverImageUrl ? (
                  <img
                    src={service.coverImageUrl}
                    alt={service.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <DollarSign className="h-8 w-8" />
                  </div>
                )}

                {/* Favorite Button */}
                <button className="absolute top-3 right-3 p-2 bg-white/80 backdrop-blur-sm rounded-full hover:bg-white transition-colors">
                  <Heart className="h-4 w-4 text-gray-600 hover:text-red-500" />
                </button>

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
                  <Link href={`/s/${service.id}`}>
                    {service.title}
                  </Link>
                </h3>
                <div className="text-right ml-2">
                  <div className="text-lg font-bold text-gray-900">
                    ${formatPrice(service.priceInCents / 100)}
                  </div>
                  <div className="text-xs text-gray-500">per hour</div>
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
                      <CheckCircle className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className={`font-medium ${getTrustScoreColor(service.provider.trustScore)}`}>
                      {getTrustScoreLabel(service.provider.trustScore)}
                    </span>
                    {service.provider.baseSuburb && (
                      <>
                        <span>•</span>
                        <span>{service.provider.baseSuburb}</span>
                      </>
                    )}
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
                <Link href={`/s/${service.id}`} className="flex-1">
                  <Button className="w-full" size="sm">
                    View Details
                  </Button>
                </Link>
                <Button variant="outline" size="sm">
                  <MessageCircle className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Load More Button */}
      <LoadMoreButton
        searchParams={searchParams}
        currentPage={page}
        hasMore={servicesWithProviders.length === limit}
      />
    </div>
  );
}