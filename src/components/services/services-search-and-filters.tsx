"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Search, SlidersHorizontal, X } from "lucide-react";
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
  { value: 'distance', label: 'Distance' },
  { value: 'newest', label: 'Recently Added' },
];

const ServicesSearchAndFilters = ({
  filters,
  onFiltersChange,
}: ServicesSearchAndFiltersProps) => {
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  const searchQuery = filters.q || "";
  const selectedCategory = filters.category ?? "";
  const priceRange: [number, number] = [
    filters.minPrice ?? 0,
    filters.maxPrice ?? 500,
  ];
  const minRating = filters.rating ?? 0;
  const sortBy = filters.sort || "relevance";

  const handleFiltersChange = (next: ServicesFilters, debounce = false) => {
    if (debounce) {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
      debounceTimeout.current = setTimeout(() => {
        onFiltersChange(next);
      }, 300);
      return;
    }
    onFiltersChange(next);
  };

  const clearFilters = () => {
    const cleared: ServicesFilters = {
      q: "",
      category: null,
      minPrice: null,
      maxPrice: null,
      rating: null,
      sort: "relevance",
    };
    handleFiltersChange(cleared);
  };

  const activeFiltersCount = [
    searchQuery,
    selectedCategory,
    minRating > 0 ? minRating : "",
    priceRange[0] > 0 || priceRange[1] < 500 ? "price" : "",
  ].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Mobile Layout - Stacked */}
      <div className="block lg:hidden space-y-4">
        {/* Search Input - Full Width */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            type="search"
            placeholder="What service do you need?"
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
            className="pl-10 h-12 text-base w-full"
          />
        </div>

        {/* Controls Row */}
        <div className="flex gap-2">
          <Select
            value={selectedCategory || "all"}
            onValueChange={(value) => {
              handleFiltersChange({
                ...filters,
                category: value === "all" ? null : value,
              });
            }}
          >
            <SelectTrigger className="h-12 flex-1">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
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
              })
            }
          >
            <SelectTrigger className="h-12 w-32">
              <SelectValue placeholder="Sort" />
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

      {/* Desktop Layout */}
      <div className="hidden lg:flex lg:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            type="search"
            placeholder="What service do you need? (e.g., 'window cleaning')"
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
            className="pl-10 h-12 text-base"
          />
        </div>

        <div className="flex gap-2">
          <Select
            value={selectedCategory || "all"}
            onValueChange={(value) => {
              handleFiltersChange({
                ...filters,
                category: value === "all" ? null : value,
              });
            }}
          >
            <SelectTrigger className="w-40 h-12">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
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
              })
            }
          >
            <SelectTrigger className="w-40 h-12">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Mobile Filters Toggle */}
          <Sheet open={showMobileFilters} onOpenChange={setShowMobileFilters}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="lg:hidden h-12 px-3 relative"
              >
                <SlidersHorizontal className="h-4 w-4" />
                {activeFiltersCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
                  >
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                {/* Mobile Filters Content */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Minimum Rating
                  </label>
                  <Select
                    value={String(minRating)}
                    onValueChange={(value) =>
                      handleFiltersChange({
                        ...filters,
                        rating: Number(value) || 0,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any rating" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Any rating</SelectItem>
                      <SelectItem value="3">3+ stars</SelectItem>
                      <SelectItem value="4">4+ stars</SelectItem>
                      <SelectItem value="4.5">4.5+ stars</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Price Range (per hour)
                  </label>
                  <div className="px-2">
                    <Slider
                      value={priceRange}
                      onValueChange={(value) =>
                        handleFiltersChange(
                          {
                            ...filters,
                            minPrice: value[0],
                            maxPrice: value[1],
                          },
                          true,
                        )
                      }
                      max={500}
                      min={0}
                      step={10}
                      className="w-full"
                    />
                    <div className="flex justify-between text-sm text-gray-500 mt-1">
                      <span>${priceRange[0]}</span>
                      <span>${priceRange[1]}</span>
                    </div>
                  </div>
                </div>

                <Button onClick={clearFilters} variant="outline" className="w-full">
                  Clear All Filters
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          <Button
            type="button"
            size="lg"
            className="h-12 px-8"
            onClick={() => onFiltersChange(filters)}
          >
            Search
          </Button>
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
                    minPrice: 0,
                    maxPrice: 500,
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
