'use client';

import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';
import { useState } from 'react';

const navLinks = [
  { href: '/dashboard/register-provider', label: 'Become a Provider' },
  { href: '/sign-in', label: 'Sign In' },
];

export function SiteHeader() {
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full bg-white border-b">
      <div className="container flex h-16 items-center justify-between">

        {/* Logo */}
        <Link href="/" className="text-2xl font-bold text-primary">
          Verial
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center space-x-2">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={buttonVariants({ variant: 'ghost' })}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/sign-up"
            className={buttonVariants({ variant: 'default' })}
          >
            Sign Up
          </Link>
        </nav>

        {/* Mobile Navigation (Hamburger Menu) */}
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="outline" size="icon">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle Menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right">
            <div className="flex flex-col space-y-4 mt-6">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={buttonVariants({ variant: 'outline' })}
                  onClick={() => setIsSheetOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/sign-up"
                className={buttonVariants({ variant: 'default' })}
                onClick={() => setIsSheetOpen(false)}
              >
                Sign Up
              </Link>
            </div>
          </SheetContent>
        </Sheet>

      </div>
    </header>
  );
}

