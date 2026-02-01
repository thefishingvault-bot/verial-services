import { redirect } from "next/navigation";
import { requireCustomer } from "@/lib/auth-guards";

export default async function DashboardPage() {
  const { role } = await requireCustomer();
  if (role === "admin") {
    redirect("/dashboard/admin");
  }

  if (role === "provider") {
    redirect("/dashboard/provider");
  }

  const [{ getCustomerDashboardData }, { CustomerDashboardSections }] = await Promise.all([
    import("@/lib/dashboard/customer-dashboard"),
    import("@/components/dashboard/customer-dashboard-sections"),
  ]);

  const data = await getCustomerDashboardData();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-6">
      <CustomerDashboardSections data={data} />
    </div>
  );
}

