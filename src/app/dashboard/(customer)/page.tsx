import { redirect } from "next/navigation";
import { CustomerDashboardSections } from "@/components/dashboard/customer-dashboard-sections";
import { getCustomerDashboardData } from "@/lib/dashboard/customer-dashboard";
import { requireCustomer } from "@/lib/auth-guards";

export default async function DashboardPage() {
  const { role } = await requireCustomer();
  if (role === "admin") {
    redirect("/dashboard/admin");
  }

  if (role === "provider") {
    redirect("/dashboard/provider");
  }

  const data = await getCustomerDashboardData();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-6">
      <CustomerDashboardSections data={data} />
    </div>
  );
}

