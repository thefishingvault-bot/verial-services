"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { serviceCategoryEnum } from "@/db/schema";

interface ServicesFiltersBarProps {
  initialCategory?: string;
  initialRegion?: string;
  initialMinPrice?: string;
  initialMaxPrice?: string;
  initialSort?: string;
}

const NZ_REGIONS = [
  "Auckland",
  "Waikato",
  "Bay of Plenty",
  "Wellington",
  "Canterbury",
  "Otago",
  "Other / NZ-wide",
];

export function ServicesFiltersBar({
  initialCategory,
  initialRegion,
  initialMinPrice,
  initialMaxPrice,
  initialSort = "relevance",
}: ServicesFiltersBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const category = searchParams.get("category") ?? initialCategory;
  const region = searchParams.get("region") ?? initialRegion;
  const minPrice = searchParams.get("minPrice") ?? initialMinPrice ?? "";
  const maxPrice = searchParams.get("maxPrice") ?? initialMaxPrice ?? "";
  const sort = searchParams.get("sort") ?? initialSort ?? "relevance";
  const favorites = searchParams.get("favorites");

  const updateQuery = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (value == null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    // Reset to first page whenever filters change
    params.set("page", "1");

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handleCategoryChange = (value: string) => {
    const newValue = value === "all" ? undefined : value;
    updateQuery({ category: newValue });
  };

  const handleRegionChange = (value: string) => {
    const newValue = value === "all" ? undefined : value;
    updateQuery({ region: newValue });
  };

  const handlePriceBlur = () => {
    const nextMin = (minPrice || "").toString().trim();
    const nextMax = (maxPrice || "").toString().trim();

    updateQuery({
      minPrice: nextMin || undefined,
      maxPrice: nextMax || undefined,
    });
  };

  const handleSortChange = (value: string) => {
    updateQuery({ sort: value });
  };

  const handleClearAll = () => {
    startTransition(() => {
      router.push(pathname);
    });
  };

  const handleFavoritesToggle = () => {
    const nextValue = favorites === "1" ? undefined : "1";
    updateQuery({ favorites: nextValue });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm md:flex-row md:items-end md:justify-between">
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Category</span>
          <Select
            value={category ?? "all"}
            onValueChange={handleCategoryChange}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {serviceCategoryEnum.enumValues.map((cat) => (
                <SelectItem key={cat} value={cat} className="capitalize">
                  {cat.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Region</span>
          <Select
            value={region ?? "all"}
            onValueChange={handleRegionChange}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="All regions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All regions</SelectItem>
              {NZ_REGIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Min price (NZD)</span>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            defaultValue={minPrice}
            onBlur={handlePriceBlur}
            placeholder="Any"
            className="h-9 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Max price (NZD)</span>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            defaultValue={maxPrice}
            onBlur={handlePriceBlur}
            placeholder="Any"
            className="h-9 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t pt-3 md:border-t-0 md:pt-0 md:pl-4 md:border-l">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Sort by</span>
          <Select value={sort} onValueChange={handleSortChange}>
            <SelectTrigger className="h-9 w-40 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Relevance</SelectItem>
              <SelectItem value="price_asc">Price: Low to High</SelectItem>
              <SelectItem value="price_desc">Price: High to Low</SelectItem>
              <SelectItem value="rating_desc">Top rated</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant={favorites === "1" ? "default" : "outline"}
            size="sm"
            onClick={handleFavoritesToggle}
            disabled={isPending}
          >
            Favourites only
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            disabled={isPending}
          >
            Clear filters
          </Button>
        </div>
      </div>
    </div>
  );
}
