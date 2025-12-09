import { BottomNavigation } from "@/components/nav/bottom-navigation";
import { SiteHeader } from "@/components/nav/site-header";
import Link from "next/link";
import { Home, Calendar, Heart, MessageSquare, Bell, User, Settings, Briefcase } from "lucide-react";
import { requireCustomer } from "@/lib/auth-guards";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/dashboard", label: "Overview", icon: Home },
  { href: "/dashboard/bookings", label: "My Bookings", icon: Calendar },
  { href: "/dashboard/favorites", label: "Favorites", icon: Heart },
  { href: "/dashboard/messages", label: "Messages", icon: MessageSquare },
  { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
  { href: "/dashboard/profile", label: "Profile", icon: User },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireCustomer();

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 md:flex-row md:gap-6">
        <aside className="hidden w-64 shrink-0 space-y-2 rounded-lg border bg-background p-4 md:block">
          <p className="text-sm font-semibold text-muted-foreground">Customer</p>
          <nav className="space-y-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
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

        <main className="flex-1 overflow-hidden">{children}</main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}

