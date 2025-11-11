'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import { Home, Briefcase, Calendar, CreditCard, User, Package } from 'lucide-react';

// Helper to determine link active state
const isActive = (pathname: string, href: string) => {
  if (href === '/dashboard') return pathname === href;
  return pathname.startsWith(href);
};

export function BottomNavigation() {
  const pathname = usePathname();
  const { user } = useUser();
  const { isSignedIn } = useAuth();
  const isProvider = user?.publicMetadata?.role === 'provider';

  if (!isSignedIn) return null;

  // Define links for customer vs. provider
  const navLinks = isProvider
    ? [ // --- PROVIDER LINKS ---
        { href: '/dashboard/bookings/provider', label: 'Bookings', icon: Briefcase },
        { href: '/dashboard/services/new', label: 'New Service', icon: Package },
        { href: '/dashboard/payouts', label: 'Payouts', icon: CreditCard },
      ]
    : [ // --- CUSTOMER LINKS ---
        { href: '/dashboard', label: 'Home', icon: Home },
        { href: '/dashboard/bookings', label: 'My Bookings', icon: Calendar },
        { href: '/dashboard/profile', label: 'Profile', icon: User }, // We will create this page soon
      ];

  return (
    <nav className="fixed bottom-0 z-50 w-full border-t bg-background md:hidden">
      <div className="grid h-16 grid-cols-3">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center justify-center gap-1 p-2 ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium">{link.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

