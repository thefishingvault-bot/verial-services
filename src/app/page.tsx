import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, CheckCircle2 } from 'lucide-react';
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

// This is the main marketing landing page (/)
export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen bg-verial-light text-verial-dark">
      {/* Header */}
      <header className="bg-white shadow-sm py-4">
        <div className="container flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-verial-blue-500">
            Verial
          </Link>
          <nav className="flex items-center space-x-4">
            <Button variant="ghost" asChild>
              <Link href="/dashboard/register-provider">Become a Provider</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/sign-in">Sign In</Link>
            </Button>
            <Button asChild>
              <Link href="/sign-up">Sign Up</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="w-full py-20 md:py-32 lg:py-40 bg-gradient-to-br from-verial-blue-50 to-verial-blue-100 flex items-center justify-center text-center">
          <div className="container max-w-3xl px-4 md:px-6">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-verial-dark mb-4">
              Find Trusted Local Services in New Zealand
            </h1>
            <p className="text-lg text-verial-muted md:text-xl mb-8">
              From cleaning and plumbing to IT support, find trusted local Kiwis for any job. Transparent pricing, secure payments, and verified providers.
            </p>
            <div className="flex w-full max-w-md mx-auto items-center space-x-2 p-1 bg-white rounded-lg shadow-md">
              <form action={searchAction} className="flex w-full">
                <Input
                  name="query"
                  type="search"
                  placeholder="What service do you need? (e.g., 'window cleaning')"
                  className="flex-1 border-none focus-visible:ring-0 shadow-none"
                />
                <Button type="submit" className="bg-verial-blue-500 hover:bg-verial-blue-600">
                  <Search className="h-5 w-5 mr-2" /> Search
                </Button>
              </form>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="w-full py-16 md:py-24 lg:py-32 bg-white">
          <div className="container px-4 md:px-6 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-verial-dark mb-12">How It Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="flex flex-col items-center text-center p-6 bg-verial-light rounded-lg shadow-sm">
                <CheckCircle2 className="h-12 w-12 text-verial-blue-500 mb-4" />
                <h3 className="text-xl font-semibold text-verial-dark mb-2">1. Browse & Book</h3>
                <p className="text-verial-muted">Find the service you need, see the price, and book in seconds.</p>
              </div>
              <div className="flex flex-col items-center text-center p-6 bg-verial-light rounded-lg shadow-sm">
                <CheckCircle2 className="h-12 w-12 text-verial-blue-500 mb-4" />
                <h3 className="text-xl font-semibold text-verial-dark mb-2">2. We Verify</h3>
                <p className="text-verial-muted">We verify every provider's identity and track their reputation.</p>
              </div>
              <div className="flex flex-col items-center text-center p-6 bg-verial-light rounded-lg shadow-sm">
                <CheckCircle2 className="h-12 w-12 text-verial-blue-500 mb-4" />
                <h3 className="text-xl font-semibold text-verial-dark mb-2">3. Get It Done</h3>
                <p className="text-verial-muted">Pay securely and get your job completed by a trusted local.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-verial-dark text-verial-light py-8">
        <div className="container flex flex-col md:flex-row items-center justify-between px-4 md:px-6">
          <p className="text-sm mb-4 md:mb-0">&copy; {new Date().getFullYear()} Verial Services Ltd. All rights reserved.</p>
          <nav className="flex space-x-4 text-sm">
            <Link href="/legal/terms" className="hover:underline">Terms of Service</Link>
            <Link href="/legal/privacy" className="hover:underline">Privacy Policy</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
