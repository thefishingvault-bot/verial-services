"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Heart, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { FavoriteToggle } from "@/components/services/favorite-toggle";
import { cn, formatPrice, getTrustBadge } from "@/lib/utils";
import type { FavoriteService, FavoriteSort } from "@/lib/favorites";

interface FavoritesGridProps {
  items: FavoriteService[];
  sort: FavoriteSort;
}

export function FavoritesGrid({ items, sort }: FavoritesGridProps) {
  const [favorites, setFavorites] = useState<FavoriteService[]>(items);

  const sortedFavorites = useMemo(() => favorites, [favorites]);

  const handleSettled = (service: FavoriteService) => (result: { isFavorited: boolean; count: number; error?: boolean }) => {
    if (result.error) return;
    setFavorites((prev) => {
      if (!result.isFavorited) {
        return prev.filter((f) => f.id !== service.id);
      }
      return prev.map((f) => (f.id === service.id ? { ...f, favoriteCount: result.count } : f));
    });
  };

  if (sortedFavorites.length === 0) return null;

  return (
    <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {sortedFavorites.map((fav) => {
        const { Icon, color } = getTrustBadge(fav.provider.trustLevel);
        const savedOn = new Intl.DateTimeFormat("en-NZ", { month: "short", day: "numeric" }).format(
          new Date(fav.favoritedAt),
        );
        return (
          <Card key={fav.id} className="overflow-hidden border bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
            <div className="relative aspect-[16/9] bg-slate-100">
              {fav.coverImageUrl ? (
                <Image
                  src={fav.coverImageUrl}
                  alt={fav.title}
                  fill
                  sizes="(min-width: 1280px) 30vw, (min-width: 768px) 45vw, 100vw"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">No image</div>
              )}
              <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                <Badge variant="secondary" className="bg-white/90 capitalize text-slate-900">
                  {fav.category.replace(/_/g, " ")}
                </Badge>
                <Badge variant="outline" className="bg-white/90 text-slate-800">
                  Saved {savedOn}
                </Badge>
              </div>
              <FavoriteToggle
                serviceId={fav.id}
                initialIsFavorite
                initialCount={fav.favoriteCount}
                showCount
                onSettled={handleSettled(fav)}
              />
            </div>

            <CardHeader className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <Link href={`/s/${fav.slug}`} className="text-lg font-semibold text-slate-900 hover:text-emerald-600">
                    {fav.title}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    <span className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium">
                      <Icon className={cn("h-4 w-4", color)} />
                      {fav.provider.trustLevel}
                    </span>
                    {fav.provider.isVerified && <Badge variant="secondary">Verified</Badge>}
                    {(fav.provider.suburb || fav.provider.region) && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {[fav.provider.suburb, fav.provider.region].filter(Boolean).join(", ")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-slate-900">{formatPrice(fav.priceInCents)}</div>
                  <div className="text-xs text-slate-500">{fav.chargesGst ? "Price includes GST" : "Price excludes GST"}</div>
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm text-slate-700">
                <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 font-medium text-amber-700">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  {fav.reviewCount > 0 ? `${fav.avgRating.toFixed(1)} (${fav.reviewCount})` : "No reviews"}
                </span>
                <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-rose-700">
                  <Heart className="h-4 w-4 fill-rose-500 text-rose-500" />
                  {fav.favoriteCount} saved
                </span>
              </div>
            </CardHeader>

            <CardContent className="text-sm text-slate-700">
              <p className="line-clamp-2">{fav.description || "No description provided."}</p>
            </CardContent>

            <CardFooter className="flex flex-col gap-2 sm:flex-row px-4 pb-4 pt-0">
              <Link href={`/s/${fav.slug}`} className="flex-1">
                <Button variant="outline" className="w-full" size="sm">
                  View Service
                </Button>
              </Link>
              <Link href={`/s/${fav.slug}#booking`} className="flex-1">
                <Button className="w-full" size="sm">
                  Book Now
                </Button>
              </Link>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
