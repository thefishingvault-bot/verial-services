'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import {
  Search,
  MapPin,
  Filter,
  Grid3X3,
  Map,
  X,
  SlidersHorizontal
} from 'lucide-react';

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
}

interface ServicesSearchAndFiltersProps {
  initialParams: SearchParams;
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
  { value: 'rating', label: 'Highest Rated' },
  { value: 'price_low', label: 'Price: Low to High' },
  { value: 'price_high', label: 'Price: High to Low' },
  { value: 'distance', label: 'Distance' },
  { value: 'newest', label: 'Recently Added' },
];

export function ServicesSearchAndFilters({ initialParams }: ServicesSearchAndFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [searchQuery, setSearchQuery] = useState(initialParams.q || '');
  const [selectedCategory, setSelectedCategory] = useState(initialParams.category || 'all');
  const [location, setLocation] = useState(initialParams.location || '');
  const [priceRange, setPriceRange] = useState([
    parseInt(initialParams.minPrice || '0'),
    parseInt(initialParams.maxPrice || '500')
  ]);
  const [minRating, setMinRating] = useState(initialParams.rating || 'any-rating');
  const [sortBy, setSortBy] = useState(initialParams.sort || 'relevance');
  const [viewMode, setViewMode] = useState<'grid' | 'map'>(initialParams.view || 'grid');
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const updateSearchParams = (updates: Partial<SearchParams>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      // Convert sentinel values back to undefined for URL params
      const processedValue = value === 'all' || value === 'any-rating' ? undefined : value;
      if (processedValue && processedValue !== '' && processedValue !== '0') {
        params.set(key, processedValue);
      } else {
        params.delete(key);
      }
    });

    router.push(`/services?${params.toString()}`);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateSearchParams({
      q: searchQuery,
      category: selectedCategory,
      location,
      minPrice: priceRange[0].toString(),
      maxPrice: priceRange[1].toString(),
      rating: minRating,
      sort: sortBy,
      view: viewMode,
    });
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setLocation('');
    setPriceRange([0, 500]);
    setMinRating('any-rating');
    setSortBy('relevance');
    router.push('/services');
  };

  const activeFiltersCount = [
    searchQuery,
    selectedCategory !== 'all' ? selectedCategory : '',
    location,
    minRating !== 'any-rating' ? minRating : '',
    priceRange[0] > 0 || priceRange[1] < 500 ? 'price' : '',
  ].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Mobile Layout - Stacked */}
      <div className="block lg:hidden space-y-4">
        {/* Search Input - Full Width */}
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              type="search"
              placeholder="What service do you need?"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12 text-base w-full"
            />
          </div>

          {/* Controls Row */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="pl-9 h-12 w-full"
              />
            </div>

            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="h-12 w-32">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.value} value={category.value}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button type="submit" size="lg" className="h-12 px-6">
              Search
            </Button>
          </div>
        </form>

        {/* Sort and View Toggle Row */}
        <div className="flex items-center justify-between gap-2">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-10 flex-1">
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

          {/* View Toggle */}
          <div className="flex border rounded-md">
            <Button
              type="button"
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className="rounded-r-none h-10 px-3"
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={viewMode === 'map' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('map')}
              className="rounded-l-none h-10 px-3"
            >
              <Map className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Desktop Layout */}
      <form onSubmit={handleSearch} className="hidden lg:flex lg:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            type="search"
            placeholder="What service do you need? (e.g., 'window cleaning')"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-12 text-base"
          />
        </div>

        <div className="flex gap-2">
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="pl-9 w-40 h-12"
            />
          </div>

          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
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

          <Select value={sortBy} onValueChange={setSortBy}>
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

          {/* View Toggle */}
          <div className="flex border rounded-md">
            <Button
              type="button"
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className="rounded-r-none h-12 px-3"
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={viewMode === 'map' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('map')}
              className="rounded-l-none h-12 px-3"
            >
              <Map className="h-4 w-4" />
            </Button>
          </div>

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
                  <Select value={minRating} onValueChange={setMinRating}>
                    <SelectTrigger>
                      <SelectValue placeholder="Any rating" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any-rating">Any rating</SelectItem>
                      <SelectItem value="4.5">4.5+ stars</SelectItem>
                      <SelectItem value="4">4+ stars</SelectItem>
                      <SelectItem value="3">3+ stars</SelectItem>
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
                      onValueChange={setPriceRange}
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

          <Button type="submit" size="lg" className="h-12 px-8">
            Search
          </Button>
        </div>
      </form>

      {/* Active Filters Display */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600">Active filters:</span>
          {searchQuery && (
            <Badge variant="secondary" className="flex items-center gap-1">
              Search: {searchQuery}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => {
                  setSearchQuery('');
                  updateSearchParams({ q: '' });
                }}
              />
            </Badge>
          )}
          {selectedCategory && selectedCategory !== 'all' && (
            <Badge variant="secondary" className="flex items-center gap-1">
              {categories.find(c => c.value === selectedCategory)?.label}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => {
                  setSelectedCategory('all');
                  updateSearchParams({ category: 'all' });
                }}
              />
            </Badge>
          )}
          {location && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {location}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => {
                  setLocation('');
                  updateSearchParams({ location: '' });
                }}
              />
            </Badge>
          )}
          {minRating && minRating !== 'any-rating' && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <span className="text-yellow-500">★</span> {minRating}+ stars
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => {
                  setMinRating('any-rating');
                  updateSearchParams({ rating: 'any-rating' });
                }}
              />
            </Badge>
          )}
          {(priceRange[0] > 0 || priceRange[1] < 500) && (
            <Badge variant="secondary" className="flex items-center gap-1">
              ${priceRange[0]} - ${priceRange[1]}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => {
                  setPriceRange([0, 500]);
                  updateSearchParams({ minPrice: '', maxPrice: '' });
                }}
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
}