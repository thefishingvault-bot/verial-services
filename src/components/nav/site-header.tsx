'use client';

import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';
import { useState } from 'react';
import { useAuth, useUser, UserButton, useClerk } from '@clerk/nextjs';
import { NotificationBell } from '@/components/nav/notification-bell';

// --- Guest Links (Signed Out) ---
const guestLinks = [
  { href: '/dashboard/register-provider', label: 'Become a Provider' },
  { href: '/sign-in', label: 'Sign In' },
];

export function SiteHeader() {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const { isSignedIn } = useAuth(); // Check if user is signed in
   const { user } = useUser();
  const { signOut } = useClerk(); // Get signOut function

  const role = (user?.publicMetadata as Record<string, unknown>)?.role as string | undefined;
  // Always send providers to /dashboard from the header.
  // Middleware will redirect approved providers to /dashboard/provider,
  // while pending/unapproved providers can still access the customer dashboard.
  const dashboardHref = role === 'admin' ? '/dashboard/admin' : '/dashboard';

  const links = isSignedIn
    ? [
        { href: dashboardHref, label: 'Dashboard' },
        { href: '/dashboard/favorites', label: 'Favorites' },
      ]
    : guestLinks;

  return (
    <header className="sticky top-0 z-50 w-full bg-white border-b">
      <div className="container flex h-16 items-center justify-between">

        {/* Logo */}
        <Link href="/" className="text-2xl font-bold text-primary">
          Verial
        </Link>

        {/* --- Desktop Navigation (Now conditional) --- */}
        <nav className="hidden md:flex items-center space-x-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={buttonVariants({ variant: 'ghost' })}
            >
              {link.label}
            </Link>
          ))}

          {isSignedIn ? (
            <div className="flex items-center space-x-2">
              <NotificationBell />
              <UserButton afterSignOutUrl="/" />
            </div>
          ) : (
            <Link
              href="/sign-up"
              className={buttonVariants({ variant: 'default' })}
            >
              Sign Up
            </Link>
          )}
        </nav>

        {/* --- Mobile Navigation (Now conditional) --- */}
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="outline" size="icon">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle Menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent 
            side="right" 
            className="w-full sm:w-80 p-0 bg-white/95 backdrop-blur-md"
          >
            <div className="flex flex-col h-full">
              {/* Header with Logo and Close */}
              <div className="flex items-center justify-between p-6 border-b">
                <Link href="/" className="text-2xl font-bold text-primary">
                  Verial
                </Link>
              </div>

              {/* Navigation Links */}
              <div className="flex-1 px-6 py-6">
                <nav className="space-y-2">
                  <Link
                    href="/"
                    className="flex items-center px-4 py-3 text-base font-medium text-gray-900 rounded-lg hover:bg-gray-50 transition-colors"
                    onClick={() => setIsSheetOpen(false)}
                  >
                    Home
                  </Link>
                  <Link
                    href="/services"
                    className="flex items-center px-4 py-3 text-base font-medium text-gray-900 rounded-lg hover:bg-gray-50 transition-colors"
                    onClick={() => setIsSheetOpen(false)}
                  >
                    Services
                  </Link>
                  {isSignedIn && (
                    <Link
                      href={dashboardHref}
                      className="flex items-center px-4 py-3 text-base font-medium text-gray-900 rounded-lg hover:bg-gray-50 transition-colors"
                      onClick={() => setIsSheetOpen(false)}
                    >
                      Dashboard
                    </Link>
                  )}
                  {isSignedIn && (
                    <Link
                      href="/dashboard/favorites"
                      className="flex items-center px-4 py-3 text-base font-medium text-gray-900 rounded-lg hover:bg-gray-50 transition-colors"
                      onClick={() => setIsSheetOpen(false)}
                    >
                      Favorites
                    </Link>
                  )}
                </nav>

                {/* Secondary Links */}
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <nav className="space-y-2">
                    <Link
                      href="/legal/terms"
                      className="flex items-center px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                      onClick={() => setIsSheetOpen(false)}
                    >
                      Terms of Service
                    </Link>
                    <Link
                      href="/legal/privacy"
                      className="flex items-center px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                      onClick={() => setIsSheetOpen(false)}
                    >
                      Privacy Policy
                    </Link>
                    <Link
                      href="#"
                      className="flex items-center px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                      onClick={() => setIsSheetOpen(false)}
                    >
                      Help & Support
                    </Link>
                  </nav>
                </div>
              </div>

              {/* Account Section */}
              {isSignedIn ? (
                <div className="border-t border-gray-200 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <NotificationBell />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">Account</p>
                      <p className="text-xs text-gray-500">Manage your account</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Link
                      href="/dashboard/profile"
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                      onClick={() => setIsSheetOpen(false)}
                    >
                      Manage Account
                    </Link>
                    <button
                      onClick={() => {
                        signOut({ redirectUrl: '/' });
                        setIsSheetOpen(false);
                      }}
                      className="flex items-center w-full px-4 py-2 text-sm text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border-t border-gray-200 p-6 space-y-3">
                  <Link
                    href="/sign-in"
                    className="flex items-center justify-center w-full px-4 py-3 text-base font-medium text-gray-900 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    onClick={() => setIsSheetOpen(false)}
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/sign-up"
                    className="flex items-center justify-center w-full px-4 py-3 text-base font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                    onClick={() => setIsSheetOpen(false)}
                  >
                    Sign Up
                  </Link>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>

      </div>
    </header>
  );
}

