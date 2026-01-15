import Link from 'next/link';
import MarketingLayout from './(marketing)/layout';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Search, CheckCircle, Sparkles, Wrench, Sprout, Laptop, Calculator, Car } from 'lucide-react';
import { redirect } from 'next/navigation';

// Server Action to handle search
async function searchAction(formData: FormData) {
  'use server';
  const query = formData.get('query') as string;
  if (query) {
    redirect(`/services?q=${encodeURIComponent(query)}`);
  }
  redirect('/services');
}

// --- Category Data ---
const categories = [
  { name: 'Cleaning', icon: Sparkles, href: '/services?category=cleaning' },
  { name: 'Plumbing', icon: Wrench, href: '/services?category=plumbing' },
  { name: 'Gardening', icon: Sprout, href: '/services?category=gardening' },
  { name: 'IT Support', icon: Laptop, href: '/services?category=it_support' },
  { name: 'Accounting', icon: Calculator, href: '/services?category=accounting' },
  { name: 'Detailing', icon: Car, href: '/services?category=detailing' },
];

function HomeContent() {
  return (
    <>
      {/* Hero Section */}
      <section className="w-full py-20 md:py-32 lg:py-40 bg-linear-to-br from-verial-blue-50 to-verial-blue-100">
        <div className="container flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-verial-dark mb-4">
            Find Trusted Local Services in New Zealand
          </h1>
          <p className="text-lg text-verial-muted md:text-xl mb-8 max-w-2xl">
            From cleaning and plumbing to IT support, find trusted local Kiwis for any job. Transparent pricing, secure payments, and verified providers.
          </p>
          <form action={searchAction} className="w-full max-w-lg">
            <div className="relative flex items-center">
              <Input
                name="query"
                type="search"
                placeholder="What service do you need? (e.g., 'window cleaning')"
                className="w-full rounded-md px-4 pr-16 h-12 shadow-sm"
              />
              <Button type="submit" variant="default" size="icon" className="absolute right-2.5">
                <Search className="h-5 w-5" />
              </Button>
            </div>
          </form>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="w-full py-16 md:py-24 bg-white">
        <div className="container px-4">
          <h2 className="text-3xl font-bold tracking-tight text-verial-dark text-center mb-12">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <Card className="bg-verial-light border-none shadow-sm">
              <CardContent className="flex flex-col items-center text-center p-8">
                <CheckCircle className="h-12 w-12 text-primary mb-4" />
                <h3 className="text-xl font-semibold text-verial-dark mb-2">1. Browse &amp; Book</h3>
                <p className="text-verial-muted">Find the service you need, see the price, and book in seconds.</p>
              </CardContent>
            </Card>

            <Card className="bg-verial-light border-none shadow-sm">
              <CardContent className="flex flex-col items-center text-center p-8">
                <CheckCircle className="h-12 w-12 text-primary mb-4" />
                <h3 className="text-xl font-semibold text-verial-dark mb-2">2. We Verify</h3>
                <p className="text-verial-muted">We verify every provider&apos;s identity and track their reputation.</p>
              </CardContent>
            </Card>

            <Card className="bg-verial-light border-none shadow-sm">
              <CardContent className="flex flex-col items-center text-center p-8">
                <CheckCircle className="h-12 w-12 text-primary mb-4" />
                <h3 className="text-xl font-semibold text-verial-dark mb-2">3. Get It Done</h3>
                <p className="text-verial-muted">Pay securely and get your job completed by a trusted local.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* --- NEW: Browse by Category Section --- */}
      <section className="w-full py-16 md:py-24 bg-verial-light">
        <div className="container px-4">
          <h2 className="text-3xl font-bold tracking-tight text-verial-dark text-center mb-12">
            Explore by Category
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {categories.map((category) => {
              const Icon = category.icon;
              return (
                <Link
                  key={category.name}
                  href={category.href}
                  className={buttonVariants({
                    variant: 'outline',
                    className: 'flex flex-col h-28 items-center justify-center gap-2 bg-white shadow-sm',
                  })}
                >
                  <Icon className="h-8 w-8 text-primary" />
                  <span className="font-semibold text-verial-dark">{category.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* --- NEW: Become a Provider CTA Section --- */}
      <section className="w-full py-20 md:py-32 bg-linear-to-r from-primary to-verial-blue-600">
        <div className="container flex flex-col items-center justify-center text-center px-4">
          <h2 className="text-3xl font-extrabold tracking-tight text-white mb-4">
            Ready to grow your business?
          </h2>
          <p className="text-lg text-verial-blue-100 mb-8 max-w-xl">
            Join New Zealand&apos;s trusted marketplace. List your services, manage bookings, and get paid, all in one place.
          </p>
          <Link
            href="/dashboard/register-provider"
            className={buttonVariants({
              variant: 'default',
              size: 'lg',
              className: 'bg-white text-verial-dark hover:bg-gray-100 hover:text-verial-dark',
            })}
          >
            Become a Provider Today
          </Link>
        </div>
      </section>
    </>
  );
}

// Home page at "/" wrapped in the marketing layout
export default function HomePage() {
  return (
    <MarketingLayout>
      <HomeContent />
    </MarketingLayout>
  );
}

