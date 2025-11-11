import { UserButton } from "@clerk/nextjs";
import { BottomNavigation } from "@/components/nav/bottom-navigation";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Main Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <a href="/dashboard" className="font-bold">
            Verial Dashboard
          </a>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      {/* Page Content */}
      <main className="pb-20">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <BottomNavigation />
    </>
  );
}

