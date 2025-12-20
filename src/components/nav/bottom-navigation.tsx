'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { Home, Calendar, User, MessageSquare, Search } from 'lucide-react';

// Helper to determine link active state
const isActive = (pathname: string, href: string) => {
  if (href === '/dashboard') return pathname === href;
  return pathname.startsWith(href);
};

export function BottomNavigation() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();

  if (!isSignedIn) return null;

  // Keep this navigation scoped to the customer dashboard only.
  if (!pathname.startsWith('/dashboard') || pathname.startsWith('/dashboard/provider')) {
    return null;
  }

  // Customer dashboard nav only (provider dashboard uses its own layout/nav)
  const navLinks = [
    { href: '/dashboard', label: 'Home', icon: Home },
    { href: '/services', label: 'Services', icon: Search },
    { href: '/dashboard/bookings', label: 'Bookings', icon: Calendar },
    { href: '/dashboard/messages', label: 'Messages', icon: MessageSquare },
    { href: '/dashboard/profile', label: 'Profile', icon: User },
  ];

  return (
    <nav className="fixed bottom-0 z-50 w-full border-t bg-background md:hidden">
      <div className="grid h-16 grid-cols-5">
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

