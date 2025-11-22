import { BottomNavigation } from "@/components/nav/bottom-navigation";
import { SiteHeader } from "@/components/nav/site-header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      {/* Page Content */}
      <main className="flex-1 overflow-hidden">{children}</main>

      {/* Mobile Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}

