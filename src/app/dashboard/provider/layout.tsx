import Link from "next/link";
import { requireProvider } from "@/lib/auth-guards";
import { SiteHeader } from "@/components/nav/site-header";
import { cn } from "@/lib/utils";
import { Home, Calendar, Briefcase, Bell, BarChart3, User } from "lucide-react";

const providerNav = [
  { href: "/dashboard/provider", label: "Overview", icon: Home },
  { href: "/dashboard/provider/bookings", label: "Bookings", icon: Calendar },
  { href: "/dashboard/provider/calendar", label: "Calendar", icon: Briefcase },
  { href: "/dashboard/provider/services", label: "Services", icon: Briefcase },
  { href: "/dashboard/provider/earnings", label: "Earnings", icon: BarChart3 },
  { href: "/dashboard/provider/notifications", label: "Notifications", icon: Bell },
  { href: "/dashboard/provider/profile", label: "Provider Profile", icon: User },
];

export default async function ProviderDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireProvider();

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 md:flex-row md:gap-6">
        <aside className="hidden w-64 shrink-0 space-y-2 rounded-lg border bg-background p-4 md:block">
          <p className="text-sm font-semibold text-muted-foreground">Provider</p>
          <nav className="space-y-1">
            {providerNav.map((link) => {
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
        </aside>

        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
