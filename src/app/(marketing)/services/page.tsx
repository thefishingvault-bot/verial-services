import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Star } from "lucide-react";
import { formatPrice, getTrustBadge } from "@/lib/utils";
import { serviceCategoryEnum } from "@/db/schema";
import { ServicesFiltersBar } from "@/components/services/services-filters-bar";

type ServiceSummary = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  priceInCents: number;
  category: (typeof serviceCategoryEnum.enumValues)[number];
  coverImageUrl: string | null;
  createdAt: string;
  provider: {
    id: string;
    handle: string | null;
    businessName: string | null;
    isVerified: boolean;
    trustLevel: "bronze" | "silver" | "gold" | "platinum" | null;
    baseRegion: string | null;
    baseSuburb?: string | null;
    serviceRadiusKm?: number | null;
  };
  avgRating: number;
  reviewCount: number;
};

interface BrowseServicesPageProps {
  searchParams?: Promise<{
    category?: string;
    region?: string;
    minPrice?: string;
    maxPrice?: string;
    sort?: string;
    page?: string;
  }>;
}

export default async function BrowseServicesPage({ searchParams }: BrowseServicesPageProps) {
  const resolvedParams = await searchParams;
  const category = resolvedParams?.category;
  const region = resolvedParams?.region;
  const minPrice = resolvedParams?.minPrice;
  const maxPrice = resolvedParams?.maxPrice;
  const sort = resolvedParams?.sort;
  const page = resolvedParams?.page ?? "1";

  const search = new URLSearchParams();
  if (category) search.set("category", category);
  if (region) search.set("region", region);
  if (minPrice) search.set("minPrice", minPrice);
  if (maxPrice) search.set("maxPrice", maxPrice);
  if (sort) search.set("sort", sort);
  if (page) search.set("page", page);

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const res = await fetch(`${baseUrl}/api/services/list?${search.toString()}`, {
    // Always fetch server-side; no caching for now to keep it simple
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Failed to load services");
  }

  const data = (await res.json()) as {
    services: ServiceSummary[];
    page: number;
    pageSize: number;
    hasMore: boolean;
  };

  const servicesList = data.services;
  const currentPage = data.page;
  const hasMore = data.hasMore;

  let title = "Browse All Services";
  if (category) title = `Services in "${category}"`;
  if (region) title = `${title} near ${region}`;

  return (
    <div className="container mx-auto py-12">
      <div className="mb-8 space-y-4">
        <h1 className="text-3xl font-bold capitalize">{title}</h1>
        <ServicesFiltersBar
          initialCategory={category}
          initialRegion={region}
          initialMinPrice={minPrice}
          initialMaxPrice={maxPrice}
          initialSort={sort ?? "relevance"}
        />
      </div>

      {servicesList.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <Package className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold">No services found</h3>
          <p className="text-muted-foreground">
            No services match your filters. Try widening your search.
          </p>
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
                    <div className="flex flex-col gap-1 max-w-[180px]">
                      <span className="truncate">{service.provider.businessName}</span>
                      {service.provider.serviceRadiusKm && (service.provider.baseSuburb || service.provider.baseRegion) && (
                        <span className="truncate text-[0.75rem] text-muted-foreground">
                          {service.provider.baseSuburb
                            ? `Within ${service.provider.serviceRadiusKm} km of ${service.provider.baseSuburb}`
                            : `Services ${service.provider.baseRegion} area`}
                        </span>
                      )}
                    </div>
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

      <div className="mt-8 flex items-center justify-center gap-4">
        <PaginationControls currentPage={currentPage} hasMore={hasMore} />
      </div>
    </div>
  );
}

function PaginationControls({ currentPage, hasMore }: { currentPage: number; hasMore: boolean }) {
  const prevPage = currentPage > 1 ? currentPage - 1 : 1;
  const nextPage = currentPage + 1;

  const basePath = "/services";

  const buildHref = (page: number) => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    return `${basePath}?${params.toString()}`;
  };

  return (
    <div className="flex items-center gap-4">
      <Link
        href={buildHref(prevPage)}
        aria-disabled={currentPage === 1}
        className={`text-sm font-medium underline-offset-4 ${
          currentPage === 1
            ? "pointer-events-none cursor-default text-muted-foreground"
            : "hover:underline"
        }`}
      >
        Previous
      </Link>
      <span className="text-xs text-muted-foreground">Page {currentPage}</span>
      <Link
        href={buildHref(nextPage)}
        aria-disabled={!hasMore}
        className={`text-sm font-medium underline-offset-4 ${
          !hasMore
            ? "pointer-events-none cursor-default text-muted-foreground"
            : "hover:underline"
        }`}
      >
        Next
      </Link>
    </div>
  );
}

