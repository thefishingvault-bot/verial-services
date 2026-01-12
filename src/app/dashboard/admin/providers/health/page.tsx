import { redirect } from "next/navigation";
import AdminProviderHealthClient from "./health-client";
import { requireAdmin } from "@/lib/admin-auth";

export default async function AdminProviderHealthPage() {
  const admin = await requireAdmin();
  if (!admin.isAdmin) redirect("/dashboard");

  return <AdminProviderHealthClient />;
}