'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search } from 'lucide-react';

// As per schema: serviceCategoryEnum
const categories = [
  'all',
  'cleaning',
  'plumbing',
  'gardening',
  'it_support',
  'accounting',
  'detailing',
  'other',
] as const;

export function ServiceFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get current values from URL or set defaults
  const currentQuery = searchParams.get('q') || '';
  const currentCategory = searchParams.get('category') || 'all';

  const handleFilterChange = (key: 'q' | 'category', value: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (key === 'category' && value === 'all') {
      params.delete('category');
    } else if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    // Use router.push to re-render the Server Component with new params
    router.push(`/services?${params.toString()}`);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <Input
          placeholder="Search by title..."
          className="pl-10"
          defaultValue={currentQuery}
          onChange={(e) => {
            // Basic debounce could be added here, but for MVP we use onBlur
          }}
          onBlur={(e) => handleFilterChange('q', e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleFilterChange('q', (e.target as HTMLInputElement).value);
            }
          }}
        />
      </div>

      {/* Category Select */}
      <Select
        value={currentCategory}
        onValueChange={(value) => handleFilterChange('category', value)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Filter by category..." />
        </SelectTrigger>
        <SelectContent>
          {categories.map((cat) => (
            <SelectItem key={cat} value={cat} className="capitalize">
              {cat === 'all' ? 'All Categories' : cat}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

