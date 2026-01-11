import { SiteHeader } from "@/components/nav/site-header";

export default function ServiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <SiteHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
