"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/nav/notification-bell";
import { cn } from "@/lib/utils";
import { UserButton } from "@clerk/nextjs";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Home, Calendar, Briefcase, BarChart3, Bell, User, MessageSquare, CreditCard, Store, ShieldCheck, MoreHorizontal } from "lucide-react";

const providerNav = [
  { href: "/dashboard/provider", label: "Overview", icon: Home },
  { href: "/jobs/new", label: "Post a Job", icon: Briefcase },
  { href: "/customer/jobs", label: "My Posted Jobs", icon: Briefcase },
  { href: "/provider/job-requests", label: "Job Requests", icon: Briefcase },
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

        <div className="flex-1 space-y-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
          <main className="rounded-lg bg-background p-4 shadow-sm md:p-6">{children}</main>
        </div>
      </div>

      {/* Mobile Provider Bottom Navigation (replaces wrapping top nav) */}
      <Sheet>
        <nav className="fixed bottom-0 z-50 w-full border-t bg-background md:hidden">
          <div className="mx-auto grid h-16 max-w-7xl grid-cols-5">
            {(() => {
              const primaryHrefs = [
                "/dashboard/provider",
                "/dashboard/provider/bookings",
                "/dashboard/provider/calendar",
                "/dashboard/provider/earnings",
              ] as const;

              const primaryLinks = primaryHrefs
                .map((href) => providerNav.find((l) => l.href === href))
                .filter(Boolean) as typeof providerNav;

              const moreLinks = providerNav.filter((l) => !primaryHrefs.includes(l.href as (typeof primaryHrefs)[number]));

              const moreActive = providerNav.some((l) => isActive(l.href)) && !primaryHrefs.some((href) => isActive(href));

              return (
                <>
                  {primaryLinks.map((link) => {
                    const Icon = link.icon;
                    const active = isActive(link.href);
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={cn(
                          "flex h-16 flex-col items-center justify-center gap-1 px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
                          active ? "text-primary" : "text-muted-foreground",
                        )}
                        aria-current={active ? "page" : undefined}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="truncate">{link.label}</span>
                      </Link>
                    );
                  })}

                  <SheetTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "flex h-16 flex-col items-center justify-center gap-1 px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
                        moreActive ? "text-primary" : "text-muted-foreground",
                      )}
                      aria-current={moreActive ? "page" : undefined}
                    >
                      <MoreHorizontal className="h-5 w-5" />
                      <span className="truncate">More</span>
                    </button>
                  </SheetTrigger>

                  <SheetContent side="bottom" className="pb-[env(safe-area-inset-bottom)]">
                    <SheetHeader>
                      <SheetTitle>More</SheetTitle>
                    </SheetHeader>
                    <div className="grid gap-1 px-4 pb-4">
                      {moreLinks.map((link) => {
                        const Icon = link.icon;
                        const active = isActive(link.href);
                        return (
                          <SheetClose key={link.href} asChild>
                            <Link
                              href={link.href}
                              className={cn(
                                "flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
                                active
                                  ? "bg-primary/10 text-primary"
                                  : "text-foreground hover:bg-muted",
                              )}
                              aria-current={active ? "page" : undefined}
                            >
                              <Icon className="h-5 w-5" />
                              <span>{link.label}</span>
                            </Link>
                          </SheetClose>
                        );
                      })}
                    </div>
                  </SheetContent>
                </>
              );
            })()}
          </div>
        </nav>
      </Sheet>
    </div>
  );
}
