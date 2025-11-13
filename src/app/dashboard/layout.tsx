import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { BottomNavigation } from "@/components/nav/bottom-navigation";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Main Header */}
      <header className="sticky top-0 z-50 w-full bg-white border-b">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/dashboard" className="text-2xl font-bold text-primary">
            Verial
          </Link>
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

