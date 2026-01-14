"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/nav/notification-bell";
import { cn } from "@/lib/utils";
import { UserButton } from "@clerk/nextjs";
import { Home, Calendar, Briefcase, BarChart3, Bell, User, MessageSquare, CreditCard, Store, ShieldCheck } from "lucide-react";

const providerNav = [
  { href: "/dashboard/provider", label: "Overview", icon: Home },
  { href: "/dashboard/provider/bookings", label: "Bookings", icon: Calendar },
  { href: "/dashboard/provider/calendar", label: "Calendar", icon: Briefcase },
  { href: "/dashboard/provider/services", label: "Your Services", icon: Briefcase },
  { href: "/services", label: "Community Services", icon: Store },
  { href: "/dashboard/provider/earnings", label: "Earnings", icon: BarChart3 },
  { href: "/dashboard/provider/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/provider/messages", label: "Messages", icon: MessageSquare },
  { href: "/dashboard/provider/notifications", label: "Notifications", icon: Bell },
  { href: "/dashboard/provider/profile", label: "Provider Profile", icon: User },
  { href: "/dashboard/provider/kyc", label: "Identity verification", icon: ShieldCheck },
];

export function ProviderShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/dashboard/provider") return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
              P
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Provider Console</p>
              <p className="text-xs text-muted-foreground">Manage bookings and earnings</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 md:flex-row md:gap-6">
        <aside className="hidden w-60 shrink-0 rounded-lg border bg-background p-3 md:block">
          <nav className="space-y-1">
            {providerNav.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1 space-y-4">
          <nav className="flex gap-2 overflow-x-auto pb-1 md:hidden">
            {providerNav.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex flex-none items-center justify-center gap-1 rounded-md border px-3 py-2 text-xs font-medium whitespace-nowrap min-w-35",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-transparent bg-background text-muted-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>

          <main className="rounded-lg bg-background p-4 shadow-sm md:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
