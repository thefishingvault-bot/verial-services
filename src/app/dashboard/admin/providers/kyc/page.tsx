import { redirect } from "next/navigation";
import AdminProviderKycClient from "./kyc-client";
import { requireAdmin } from "@/lib/admin-auth";

export default async function AdminProviderKycPage() {
  const admin = await requireAdmin();
  if (!admin.isAdmin) redirect("/dashboard");

  return <AdminProviderKycClient />;
}