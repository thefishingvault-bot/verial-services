import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Gem, Award, Shield } from 'lucide-react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Helper to format currency
export const formatPrice = (priceInCents: number) => {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
  }).format(priceInCents / 100);
};

// Helper to get Trust Badge icon and color
export const getTrustBadge = (level: 'bronze' | 'silver' | 'gold' | 'platinum') => {
  switch (level) {
    case 'platinum':
      return { icon: <Gem className="h-4 w-4 mr-1" />, color: 'text-blue-500' };
    case 'gold':
      return { icon: <Award className="h-4 w-4 mr-1" />, color: 'text-yellow-500' };
    case 'silver':
      return { icon: <Shield className="h-4 w-4 mr-1" />, color: 'text-gray-500' };
    default:
      return { icon: <Shield className="h-4 w-4 mr-1" />, color: 'text-yellow-800' };
  }
};
