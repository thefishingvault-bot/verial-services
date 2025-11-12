import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

// This is the main marketing landing page (/)
export default function HomePage() {
  return (
    <>
      {/* Main Header (Temporary - we'll make a real one later) */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <a href="/" className="font-bold text-xl">
            Verial
          </a>
          <div className="flex items-center space-x-2">
            <Link
              href="/dashboard/register-provider"
              className={buttonVariants({ variant: 'ghost' })}
            >
              Become a Provider
            </Link>
            <Link
              href="/sign-in"
              className={buttonVariants({ variant: 'outline' })}
            >
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className={buttonVariants({ variant: 'default' })}
            >
              Sign Up
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container flex flex-col items-center justify-center gap-6 py-20 md:py-32">
        <div className="max-w-3xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight md:text-6xl">
            Find Trusted Local Services in New Zealand
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            From cleaning and plumbing to IT support, find trusted local Kiwis for any job.
            Transparent pricing, secure payments, and verified providers.
          </p>
        </div>

        {/* Search Bar (Placeholder) */}
        <div className="w-full max-w-lg">
          <form>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="search"
                placeholder="What service do you need? (e.g., 'window cleaning')"
                className="w-full rounded-full pl-10 pr-20 h-12"
              />
              <Button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full h-9">
                Search
              </Button>
            </div>
          </form>
        </div>
      </section>

      {/* How it Works Section (Placeholder) */}
      <section className="container py-16">
        <h2 className="text-3xl font-bold text-center mb-12">How it Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="flex flex-col items-center text-center">
            <div className="rounded-full bg-primary text-primary-foreground h-16 w-16 flex items-center justify-center text-2xl font-bold mb-4">1</div>
            <h3 className="text-xl font-semibold mb-2">Browse & Book</h3>
            <p className="text-muted-foreground">Find the service you need, see the price, and book in seconds.</p>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="rounded-full bg-primary text-primary-foreground h-16 w-16 flex items-center justify-center text-2xl font-bold mb-4">2</div>
            <h3 className="text-xl font-semibold mb-2">We Verify</h3>
            <p className="text-muted-foreground">We verify every provider's identity and track their reputation.</p>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="rounded-full bg-primary text-primary-foreground h-16 w-16 flex items-center justify-center text-2xl font-bold mb-4">3</div>
            <h3 className="text-xl font-semibold mb-2">Get it Done</h3>
            <p className="text-muted-foreground">Pay securely and get your job completed by a trusted local.</p>
          </div>
        </div>
      </section>

      {/* Footer (Placeholder) */}
      <footer className="border-t py-8">
        <div className="container text-center text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Verial Services Ltd. All rights reserved.</p>
          <div className="flex justify-center space-x-4 mt-4">
            <Link href="/legal/terms" className="hover:text-primary">Terms of Service</Link>
            <Link href="/legal/privacy" className="hover:text-primary">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
