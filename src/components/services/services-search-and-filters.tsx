"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import type { ServicesFilters } from "@/lib/services-data";

interface ServicesSearchAndFiltersProps {
  filters: ServicesFilters;
  onFiltersChange: (next: ServicesFilters) => void;
}

const categories = [
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'gardening', label: 'Gardening' },
  { value: 'it_support', label: 'IT Support' },
  { value: 'accounting', label: 'Accounting' },
  { value: 'detailing', label: 'Detailing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'painting', label: 'Painting' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'handyman', label: 'Handyman' },
];

const sortOptions = [
  { value: 'relevance', label: 'Most Relevant' },
  { value: 'rating_desc', label: 'Highest Rated' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'newest', label: 'Recently Added' },
];

const regions = [
  'Auckland',
  'Waikato',
  'Bay of Plenty',
  'Wellington',
  'Canterbury',
  'Otago',
  'Other / NZ-wide',
];

const ServicesSearchAndFilters = ({
  filters,
  onFiltersChange,
}: ServicesSearchAndFiltersProps) => {
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  const searchQuery = filters.q || "";
  const selectedCategory = filters.category ?? "";
  const selectedRegion = filters.region ?? "";
  const priceRange: [number, number] = [
    filters.minPrice ?? 0,
    filters.maxPrice ?? 500,
  ];
  const minPriceValue = filters.minPrice ?? "";
  const maxPriceValue = filters.maxPrice ?? "";
  const minRating = filters.rating ?? 0;
  const sortBy = filters.sort || "relevance";
  const pageSize = filters.pageSize ?? 12;

  const handleFiltersChange = (next: ServicesFilters, debounce = false) => {
    const normalized: ServicesFilters = {
      ...filters,
      ...next,
      page: next.page ?? 1,
      pageSize: next.pageSize ?? pageSize,
    };

    if (debounce) {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
      debounceTimeout.current = setTimeout(() => {
        onFiltersChange(normalized);
      }, 300);
      return;
    }
    onFiltersChange(normalized);
  };

  const clearFilters = () => {
    const cleared: ServicesFilters = {
      q: "",
      category: null,
      region: null,
      minPrice: null,
      maxPrice: null,
      rating: null,
      sort: "relevance",
      page: 1,
      pageSize,
    };
    handleFiltersChange(cleared);
  };

  const activeFiltersCount = [
    searchQuery,
    selectedCategory,
    selectedRegion,
    minRating > 0 ? minRating : "",
    priceRange[0] > 0 || priceRange[1] < 500 ? "price" : "",
  ].filter(Boolean).length;

  return (
    <div className="space-y-3">
      {/* Main search + filters bar */}
      <div className="mb-1 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 shadow-sm">
          {/* Mobile layout */}
          <div className="space-y-2 md:hidden">
            {/* Search */}
            <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-slate-200 focus-within:ring-2 focus-within:ring-emerald-500/60 focus-within:border-emerald-500 transition">
              <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                placeholder="What service do you need? (e.g., 'window cleaning')"
                className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                value={searchQuery}
                onChange={(e) =>
                  handleFiltersChange(
                    {
                      ...filters,
                      q: e.target.value,
                    },
                    true,
                  )
                }
              />
            </div>

            {/* Category + sort */}
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={selectedCategory || "all"}
                onValueChange={(value) => {
                  handleFiltersChange({
                    ...filters,
                    category: value === "all" ? null : value,
                    page: 1,
                  });
                }}
              >
                <SelectTrigger
                  aria-label="Filter by category"
                  className="h-10 rounded-lg border-slate-200 bg-white text-xs sm:text-sm font-medium text-slate-700"
                >
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={sortBy}
                onValueChange={(value) =>
                  handleFiltersChange({
                    ...filters,
                    sort: value as ServicesFilters["sort"],
                    page: 1,
                  })
                }
              >
                <SelectTrigger
                  aria-label="Sort services"
                  className="h-10 rounded-lg border-slate-200 bg-white text-xs sm:text-sm font-medium text-slate-700"
                >
                  <SelectValue placeholder="Most relevant" />
                </SelectTrigger>
                <SelectContent>
                  {sortOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Desktop layout */}
          <div className="hidden md:flex items-center gap-3">
            {/* Search */}
            <div className="flex-1 flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-slate-200 focus-within:ring-2 focus-within:ring-emerald-500/60 focus-within:border-emerald-500 transition">
              <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                placeholder="What service do you need? (e.g., 'window cleaning')"
                className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                value={searchQuery}
                onChange={(e) =>
                  handleFiltersChange(
                    {
                      ...filters,
                      q: e.target.value,
                    },
                    true,
                  )
                }
              />
            </div>

            {/* Category */}
            <Select
              value={selectedCategory || "all"}
              onValueChange={(value) => {
                handleFiltersChange({
                  ...filters,
                  category: value === "all" ? null : value,
                  page: 1,
                });
              }}
            >
              <SelectTrigger
                aria-label="Filter by category"
                className="h-10 min-w-[160px] rounded-lg border-slate-200 bg-white text-sm font-medium text-slate-700"
              >
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.value} value={category.value}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select
              value={sortBy}
              onValueChange={(value) =>
                handleFiltersChange({
                  ...filters,
                  sort: value as ServicesFilters["sort"],
                  page: 1,
                })
              }
            >
              <SelectTrigger
                aria-label="Sort services"
                className="h-10 min-w-[150px] rounded-lg border-slate-200 bg-white text-sm font-medium text-slate-700"
              >
                <SelectValue placeholder="Most relevant" />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Secondary filters */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">Region</span>
          <Select
            value={selectedRegion || "all"}
            onValueChange={(value) =>
              handleFiltersChange({
                ...filters,
                region: value === "all" ? null : value,
                page: 1,
              })
            }
          >
            <SelectTrigger className="h-10 rounded-lg border-slate-200 bg-white text-sm font-medium text-slate-700">
              <SelectValue placeholder="All regions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All regions</SelectItem>
              {regions.map((region) => (
                <SelectItem key={region} value={region}>
                  {region}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">Min price (NZD)</span>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            value={minPriceValue}
            onChange={(e) => {
              const next = e.target.value;
              const parsed = next === "" ? null : Number(next);
              handleFiltersChange({
                ...filters,
                minPrice: Number.isFinite(parsed) ? parsed : null,
                page: 1,
              });
            }}
            placeholder="Any"
            className="h-10 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">Max price (NZD)</span>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            value={maxPriceValue}
            onChange={(e) => {
              const next = e.target.value;
              const parsed = next === "" ? null : Number(next);
              handleFiltersChange({
                ...filters,
                maxPrice: Number.isFinite(parsed) ? parsed : null,
                page: 1,
              });
            }}
            placeholder="Any"
            className="h-10 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">Minimum rating</span>
          <Select
            value={minRating ? String(minRating) : "all"}
            onValueChange={(value) =>
              handleFiltersChange({
                ...filters,
                rating: value === "all" ? null : Number(value),
                page: 1,
              })
            }
          >
            <SelectTrigger className="h-10 rounded-lg border-slate-200 bg-white text-sm font-medium text-slate-700">
              <SelectValue placeholder="Any rating" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any rating</SelectItem>
              <SelectItem value="3">3.0+ stars</SelectItem>
              <SelectItem value="4">4.0+ stars</SelectItem>
              <SelectItem value="4.5">4.5+ stars</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Active Filters Display */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600">Active filters:</span>
          {searchQuery && (
            <Badge variant="secondary" className="flex items-center gap-1">
              Search: {searchQuery}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() =>
                  handleFiltersChange({
                    ...filters,
                    q: "",
                  })
                }
              />
            </Badge>
          )}
          {selectedCategory && (
            <Badge variant="secondary" className="flex items-center gap-1">
              {
                categories.find((c) => c.value === selectedCategory)?.label ??
                selectedCategory
              }
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() =>
                  handleFiltersChange({
                    ...filters,
                    category: null,
                    page: 1,
                  })
                }
              />
            </Badge>
          )}
          {selectedRegion && (
            <Badge variant="secondary" className="flex items-center gap-1">
              {selectedRegion}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() =>
                  handleFiltersChange({
                    ...filters,
                    region: null,
                    page: 1,
                  })
                }
              />
            </Badge>
          )}
          {minRating > 0 && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <span className="text-yellow-500">★</span> {minRating}+ stars
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() =>
                  handleFiltersChange({
                    ...filters,
                    rating: 0,
                    page: 1,
                  })
                }
              />
            </Badge>
          )}
          {(priceRange[0] > 0 || priceRange[1] < 500) && (
            <Badge variant="secondary" className="flex items-center gap-1">
              ${priceRange[0]} - ${priceRange[1]}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() =>
                  handleFiltersChange({
                    ...filters,
                    minPrice: null,
                    maxPrice: null,
                    page: 1,
                  })
                }
              />
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-xs h-6 px-2"
          >
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
};

export default ServicesSearchAndFilters;
