'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth, useClerk, useUser } from '@clerk/nextjs';
import { Home, Calendar, MessageSquare, Search, MoreHorizontal, PlusCircle, Briefcase, Heart, User, Bell, LogOut } from 'lucide-react';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

// Helper to determine link active state
const isActive = (pathname: string, href: string) => {
  if (href === '/dashboard') return pathname === href;
  return pathname.startsWith(href);
};

function isCustomerMobileNavRoute(pathname: string) {
  if (pathname.startsWith('/dashboard/provider') || pathname.startsWith('/dashboard/admin')) return false;
  return (
    pathname.startsWith('/dashboard') ||
    pathname === '/services' ||
    pathname === '/jobs/new' ||
    pathname.startsWith('/customer/jobs')
  );
}

export function BottomNavigation() {
  const pathname = usePathname();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { isSignedIn } = useAuth();
  const role = (user?.publicMetadata as Record<string, unknown> | undefined)?.role as string | undefined;
  const isProviderUser = role === 'provider' || role === 'admin';

  if (!isSignedIn) return null;
  if (isProviderUser) return null;

  // Keep this navigation scoped to the customer dashboard only.
  if (!isCustomerMobileNavRoute(pathname)) {
    return null;
  }

  const primaryLinks = [
    { href: '/dashboard', label: 'Home', icon: Home },
    { href: '/services', label: 'Services', icon: Search },
    { href: '/dashboard/bookings', label: 'Bookings', icon: Calendar },
    { href: '/dashboard/messages', label: 'Messages', icon: MessageSquare },
  ] as const;

  const moreActive = [
    '/jobs/new',
    '/customer/jobs',
    '/dashboard/favorites',
    '/dashboard/profile',
    '/dashboard/notifications',
    '/dashboard/register-provider',
    '/dashboard/provider',
    '/legal/terms',
    '/legal/privacy',
    '/help',
  ].some((href) => isActive(pathname, href));

  return (
    <Sheet>
      <nav className="fixed bottom-0 z-50 w-full border-t bg-background md:hidden">
        <div className="grid h-16 grid-cols-5">
          {primaryLinks.map((link) => {
            const Icon = link.icon;
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="h-5 w-5" />
                <span className="truncate">{link.label}</span>
              </Link>
            );
          })}

          <SheetTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex h-16 flex-col items-center justify-center gap-1 px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
                moreActive ? 'text-primary' : 'text-muted-foreground',
              )}
              aria-current={moreActive ? 'page' : undefined}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="truncate">More</span>
            </button>
          </SheetTrigger>
        </div>
      </nav>

      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <SheetHeader>
          <SheetTitle>More</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-4 pt-2">
          <section className="space-y-1">
            <p className="px-2 text-xs font-semibold uppercase text-muted-foreground">Actions</p>
            <SheetClose asChild>
              <Link href="/jobs/new" className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-muted">
                <PlusCircle className="h-5 w-5" />
                <span>Post a Job</span>
              </Link>
            </SheetClose>
            <SheetClose asChild>
              <Link href="/customer/jobs" className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-muted">
                <Briefcase className="h-5 w-5" />
                <span>My Jobs</span>
              </Link>
            </SheetClose>
          </section>

          <section className="space-y-1">
            <p className="px-2 text-xs font-semibold uppercase text-muted-foreground">Saved</p>
            <SheetClose asChild>
              <Link href="/dashboard/favorites" className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-muted">
                <Heart className="h-5 w-5" />
                <span>Favorites</span>
              </Link>
            </SheetClose>
          </section>

          <section className="space-y-1">
            <p className="px-2 text-xs font-semibold uppercase text-muted-foreground">Account</p>
            <SheetClose asChild>
              <Link href="/dashboard/profile" className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-muted">
                <User className="h-5 w-5" />
                <span>Profile</span>
              </Link>
            </SheetClose>
            <SheetClose asChild>
              <Link href="/dashboard/profile" className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-muted">
                <User className="h-5 w-5" />
                <span>Manage Account</span>
              </Link>
            </SheetClose>
            <SheetClose asChild>
              <Link href="/dashboard/notifications" className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-muted">
                <Bell className="h-5 w-5" />
                <span>Notifications</span>
              </Link>
            </SheetClose>
            <button
              type="button"
              onClick={() => signOut({ redirectUrl: '/' })}
              className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-5 w-5" />
              <span>Sign out</span>
            </button>
          </section>

          <section className="space-y-1">
            <p className="px-2 text-xs font-semibold uppercase text-muted-foreground">Provider</p>
            <SheetClose asChild>
              <Link href="/dashboard/register-provider" className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-muted">
                <Briefcase className="h-5 w-5" />
                <span>Become a Provider</span>
              </Link>
            </SheetClose>
          </section>

          <section className="space-y-1">
            <p className="px-2 text-xs font-semibold uppercase text-muted-foreground">Legal</p>
            <SheetClose asChild>
              <Link href="/legal/terms" className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-muted">
                <span>Terms</span>
              </Link>
            </SheetClose>
            <SheetClose asChild>
              <Link href="/legal/privacy" className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-muted">
                <span>Privacy</span>
              </Link>
            </SheetClose>
            <SheetClose asChild>
              <Link href="/help" className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-muted">
                <span>Help</span>
              </Link>
            </SheetClose>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

