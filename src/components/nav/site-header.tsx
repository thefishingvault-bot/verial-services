'use client';

import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';
import { useState } from 'react';
import { useAuth, UserButton } from '@clerk/nextjs'; // Import auth hooks

// --- Guest Links (Signed Out) ---
const guestLinks = [
  { href: '/dashboard/register-provider', label: 'Become a Provider' },
  { href: '/sign-in', label: 'Sign In' },
];

// --- Auth Links (Signed In) ---
const authLinks = [
  { href: '/dashboard', label: 'Dashboard' },
];

export function SiteHeader() {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const { isSignedIn } = useAuth(); // Check if user is signed in

  const links = isSignedIn ? authLinks : guestLinks;

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
            <UserButton afterSignOutUrl="/" />
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
          <SheetContent side="right">
            <div className="flex flex-col space-y-4 mt-6">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={buttonVariants({ variant: 'outline' })}
                  onClick={() => setIsSheetOpen(false)}
                >
                  {link.label}
                </Link>
              ))}

              {isSignedIn ? (
                 <div className="pt-4 border-t">
                   <UserButton afterSignOutUrl="/" showName />
                 </div>
              ) : (
                <Link
                  href="/sign-up"
                  className={buttonVariants({ variant: 'default' })}
                  onClick={() => setIsSheetOpen(false)}
                >
                  Sign Up
                </Link>
              )}
            </div>
          </SheetContent>
        </Sheet>

      </div>
    </header>
  );
}

