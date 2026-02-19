"use client";

import { usePathname } from "next/navigation";
import { BottomNavigation } from "@/components/nav/bottom-navigation";
import { SiteHeader } from "@/components/nav/site-header";
import Link from "next/link";
import { Home, Calendar, Heart, MessageSquare, Bell, User, Briefcase, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/dashboard", label: "Overview", icon: Home },
  { href: "/customer/jobs", label: "Jobs", icon: Briefcase },
  { href: "/jobs/new", label: "Post a Job", icon: Plus },
  { href: "/services", label: "Services", icon: Briefcase },
  { href: "/dashboard/bookings", label: "My Bookings", icon: Calendar },
  { href: "/dashboard/favorites", label: "Favorites", icon: Heart },
  { href: "/dashboard/messages", label: "Messages", icon: MessageSquare },
  { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
  { href: "/dashboard/profile", label: "Profile", icon: User },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isProvider = pathname.startsWith("/dashboard/provider");

  // Provider dashboard uses its own layout; render children only to avoid double nav/sidebars.
  if (isProvider) {
    return <div className="min-h-screen bg-muted/20">{children}</div>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 md:flex-row md:gap-8">
        <aside className="hidden w-60 shrink-0 space-y-2 rounded-lg border bg-background p-3 md:block">
          <p className="text-sm font-semibold text-muted-foreground">Customer</p>
          <nav className="space-y-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="h-4 w-4" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-4 rounded-md border bg-muted/30 p-3">
            <Link href="/dashboard/register-provider" className="flex items-center gap-2 text-sm font-medium text-primary">
              <Briefcase className="h-4 w-4" />
              Become a provider
            </Link>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] scroll-pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0 md:scroll-pb-0">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}

