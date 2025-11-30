'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Star,
  MapPin,
  Clock,
  CheckCircle,
  X,
  RotateCcw
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

interface ServicesAdvancedFiltersProps {
  searchParams: SearchParams;
  filterCounts?: {
    categories: { category: string; count: number }[];
    trustLevels: { trustLevel: string; count: number }[];
    verified: number;
    availability: { value: string; count: number }[];
    distance: { value: number; count: number }[];
  };
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

const trustLevels = [
  { value: 'platinum', label: 'Platinum', color: 'bg-purple-500' },
  { value: 'gold', label: 'Gold', color: 'bg-yellow-500' },
  { value: 'silver', label: 'Silver', color: 'bg-gray-400' },
  { value: 'bronze', label: 'Bronze', color: 'bg-orange-500' },
];

const availabilityOptions = [
  { value: 'today', label: 'Available Today' },
  { value: 'tomorrow', label: 'Available Tomorrow' },
  { value: 'weekend', label: 'Available This Weekend' },
  { value: 'next_week', label: 'Available Next Week' },
];

export function ServicesAdvancedFilters({ searchParams, filterCounts }: ServicesAdvancedFiltersProps) {
  const router = useRouter();
  const currentSearchParams = useSearchParams();

  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    searchParams.category ? [searchParams.category] : []
  );
  const [selectedTrustLevels, setSelectedTrustLevels] = useState<string[]>([]);
  const [selectedAvailability, setSelectedAvailability] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState([
    parseInt(searchParams.minPrice || '0'),
    parseInt(searchParams.maxPrice || '500')
  ]);
  const [minRating, setMinRating] = useState(searchParams.rating ? parseFloat(searchParams.rating) : 0);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [distance, setDistance] = useState(25); // km

  const updateFilters = (updates: Partial<{
    categories: string[];
    trustLevels: string[];
    availability: string[];
    priceRange: number[];
    minRating: number;
    verifiedOnly: boolean;
    distance: number;
  }>) => {
    const params = new URLSearchParams(currentSearchParams.toString());

    if (updates.categories !== undefined) {
      if (updates.categories.length > 0) {
        params.set('category', updates.categories[0]); // For now, support single category
      } else {
        params.delete('category');
      }
    }

    if (updates.priceRange !== undefined) {
      if (updates.priceRange[0] > 0) {
        params.set('minPrice', updates.priceRange[0].toString());
      } else {
        params.delete('minPrice');
      }
      if (updates.priceRange[1] < 500) {
        params.set('maxPrice', updates.priceRange[1].toString());
      } else {
        params.delete('maxPrice');
      }
    }

    if (updates.minRating !== undefined) {
      if (updates.minRating > 0) {
        params.set('rating', updates.minRating.toString());
      } else {
        params.delete('rating');
      }
    }

    router.push(`/services?${params.toString()}`);
  };

  const clearAllFilters = () => {
    setSelectedCategories([]);
    setSelectedTrustLevels([]);
    setSelectedAvailability([]);
    setPriceRange([0, 500]);
    setMinRating(0);
    setVerifiedOnly(false);
    setDistance(25);
    router.push('/services');
  };

  const activeFiltersCount =
    selectedCategories.length +
    selectedTrustLevels.length +
    selectedAvailability.length +
    (priceRange[0] > 0 || priceRange[1] < 500 ? 1 : 0) +
    (minRating > 0 ? 1 : 0) +
    (verifiedOnly ? 1 : 0) +
    (distance < 25 ? 1 : 0);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Filters</CardTitle>
          {activeFiltersCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="text-xs h-7 px-2"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Clear all
            </Button>
          )}
        </div>
        {activeFiltersCount > 0 && (
          <Badge variant="secondary" className="w-fit">
            {activeFiltersCount} active filter{activeFiltersCount !== 1 ? 's' : ''}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        <ScrollArea className="h-[600px] pr-4">
          {/* Categories */}
          <div className="space-y-3">
            <h3 className="font-medium text-gray-900">Service Categories</h3>
            <div className="space-y-2">
              {categories.map((category) => {
                const liveCount = filterCounts?.categories?.find(c => c.category === category.value)?.count ?? 0;
                return (
                  <div key={category.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`category-${category.value}`}
                      checked={selectedCategories.includes(category.value)}
                      onCheckedChange={(checked) => {
                        const newCategories = checked
                          ? [...selectedCategories, category.value]
                          : selectedCategories.filter(c => c !== category.value);
                        setSelectedCategories(newCategories);
                        updateFilters({ categories: newCategories });
                      }}
                    />
                    <label
                      htmlFor={`category-${category.value}`}
                      className="text-sm text-gray-700 flex-1 cursor-pointer"
                    >
                      {category.label}
                    </label>
                    <span className="text-xs text-gray-500">({liveCount})</span>
                  </div>
                );
              })}
            </div>
          </div>

          <Separator className="my-6" />

          {/* Price Range */}
          <div className="space-y-3">
            <h3 className="font-medium text-gray-900">Price Range (per hour)</h3>
            <div className="px-2">
              <Slider
                value={priceRange}
                onValueChange={(value) => {
                  setPriceRange(value);
                  updateFilters({ priceRange: value });
                }}
                max={500}
                min={0}
                step={5}
                className="w-full"
              />
              <div className="flex justify-between text-sm text-gray-500 mt-2">
                <span>${priceRange[0]}</span>
                <span>${priceRange[1]}</span>
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Minimum Rating */}
          <div className="space-y-3">
            <h3 className="font-medium text-gray-900">Minimum Rating</h3>
            <div className="space-y-2">
              {[4.5, 4.0, 3.5, 3.0].map((rating) => (
                <div key={rating} className="flex items-center space-x-2">
                  <Checkbox
                    id={`rating-${rating}`}
                    checked={minRating === rating}
                    onCheckedChange={(checked) => {
                      const newRating = checked ? rating : 0;
                      setMinRating(newRating);
                      updateFilters({ minRating: newRating });
                    }}
                  />
                  <label
                    htmlFor={`rating-${rating}`}
                    className="text-sm text-gray-700 flex-1 cursor-pointer flex items-center gap-1"
                  >
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    {rating}+ stars
                  </label>
                </div>
              ))}
            </div>
          </div>

          <Separator className="my-6" />

          {/* Provider Trust Level */}
          <div className="space-y-3">
            <h3 className="font-medium text-gray-900">Provider Trust Level</h3>
            <div className="space-y-2">
              {trustLevels.map((level) => {
                const liveCount = filterCounts?.trustLevels?.find(t => t.trustLevel === level.value)?.count ?? 0;
                return (
                  <div key={level.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`trust-${level.value}`}
                      checked={selectedTrustLevels.includes(level.value)}
                      onCheckedChange={(checked) => {
                        const newLevels = checked
                          ? [...selectedTrustLevels, level.value]
                          : selectedTrustLevels.filter(l => l !== level.value);
                        setSelectedTrustLevels(newLevels);
                      }}
                    />
                    <label
                      htmlFor={`trust-${level.value}`}
                      className="text-sm text-gray-700 flex-1 cursor-pointer flex items-center gap-2"
                    >
                      <div className={`w-3 h-3 rounded-full ${level.color}`}></div>
                      {level.label}
                    </label>
                    <span className="text-xs text-gray-500">({liveCount})</span>
                  </div>
                );
              })}
            </div>
          </div>

          <Separator className="my-6" />

          {/* Verification Status */}
          <div className="space-y-3">
            <h3 className="font-medium text-gray-900">Verification Status</h3>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="verified-only"
                checked={verifiedOnly}
                onCheckedChange={(checked) => {
                  setVerifiedOnly(checked as boolean);
                }}
              />
              <label
                htmlFor="verified-only"
                className="text-sm text-gray-700 flex-1 cursor-pointer flex items-center gap-2"
              >
                <CheckCircle className="h-4 w-4 text-blue-500" />
                Verified providers only
              </label>
              <span className="text-xs text-gray-500">({filterCounts?.verified ?? 0})</span>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Availability */}
          <div className="space-y-3">
            <h3 className="font-medium text-gray-900">Availability</h3>
            <div className="space-y-2">
              {availabilityOptions.map((option) => {
                const liveCount = filterCounts?.availability?.find(a => a.value === option.value)?.count ?? 0;
                return (
                  <div key={option.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`availability-${option.value}`}
                      checked={selectedAvailability.includes(option.value)}
                      onCheckedChange={(checked) => {
                        const newAvailability = checked
                          ? [...selectedAvailability, option.value]
                          : selectedAvailability.filter(a => a !== option.value);
                        setSelectedAvailability(newAvailability);
                      }}
                    />
                    <label
                      htmlFor={`availability-${option.value}`}
                      className="text-sm text-gray-700 flex-1 cursor-pointer flex items-center gap-2"
                    >
                      <Clock className="h-4 w-4 text-gray-400" />
                      {option.label}
                    </label>
                    <span className="text-xs text-gray-500">({liveCount})</span>
                  </div>
                );
              })}
            </div>
          </div>

          <Separator className="my-6" />

          {/* Distance */}
          <div className="space-y-3">
            <h3 className="font-medium text-gray-900">Distance</h3>
            <div className="px-2">
              <Slider
                value={[distance]}
                onValueChange={(value) => setDistance(value[0])}
                max={100}
                min={1}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-sm text-gray-500 mt-2">
                <span>Within {distance}km</span>
                <span>of your location</span>
                <span className="text-xs text-gray-500">({filterCounts?.distance?.find(d => d.value === distance)?.count ?? 0})</span>
              </div>
            </div>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}