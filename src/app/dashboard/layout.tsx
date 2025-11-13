import { BottomNavigation } from "@/components/nav/bottom-navigation";
import { SiteHeader } from "@/components/nav/site-header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />

      {/* Page Content */}
      <main className="pb-20">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <BottomNavigation />
    </>
  );
}

