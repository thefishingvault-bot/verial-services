import Link from 'next/link';
import { SiteHeader } from '@/components/nav/site-header';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <SiteHeader />
      <main className="flex-1">{children}</main>

      {/* Dark Footer (from mockup) */}
      <footer className="bg-verial-dark text-gray-400">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between py-8">
          <p className="text-sm mb-4 md:mb-0">
            &copy; {new Date().getFullYear()} Verial Services Ltd. All rights reserved.
          </p>
          <nav className="flex space-x-4 text-sm">
            <Link href="/legal/terms" className="hover:underline hover:text-white">Terms of Service</Link>
            <Link href="/legal/privacy" className="hover:underline hover:text-white">Privacy Policy</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

