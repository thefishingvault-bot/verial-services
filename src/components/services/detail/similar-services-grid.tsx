import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SimilarService } from "@/lib/similar-services";
import { formatServicePriceLabel } from "@/lib/pricing";

interface SimilarServicesGridProps {
  services: SimilarService[];
}

export function SimilarServicesGrid({ services }: SimilarServicesGridProps) {
  if (services.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Similar services near you</h3>
        <Link href="/services">
          <Button variant="ghost" size="sm">View all</Button>
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {services.map((svc) => (
          <Card key={svc.id} className="py-0 gap-0 overflow-hidden border bg-white">
            <CardHeader className="p-0">
            <div className="relative aspect-4/3 bg-slate-100">
                {svc.coverImageUrl ? (
                  <Image
                    src={svc.coverImageUrl}
                    alt={svc.title}
                    fill
                    className="object-cover"
                    sizes="(min-width: 768px) 33vw, 100vw"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400 text-sm">No image</div>
                )}
                <div className="absolute top-3 left-3">
                  <Badge variant="secondary" className="bg-white/90 text-slate-900 capitalize">{svc.category.replace(/_/g, " ")}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-3 space-y-2">
              <Link href={`/s/${svc.slug}`} className="font-semibold text-slate-900 line-clamp-2 hover:text-emerald-600">
                {svc.title}
              </Link>
              <div className="text-sm text-slate-600 line-clamp-2">{svc.description || 'No description'}</div>
              <div className="flex items-center justify-between text-sm text-slate-700">
                <span className="font-semibold">
                  {formatServicePriceLabel({ pricingType: svc.pricingType, priceInCents: svc.priceInCents })}
                </span>
                <span className="flex items-center gap-1 text-amber-600 font-medium">
                  {svc.avgRating.toFixed(1)}★ ({svc.reviewCount})
                </span>
              </div>
              <div className="text-xs text-slate-500 truncate">{svc.providerBusinessName}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
