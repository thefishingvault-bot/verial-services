import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import AdminProviderKycClient from "./kyc-client";
import { requireAdmin } from "@/lib/admin";

export default async function AdminProviderKycPage() {
  const user = await currentUser();
  if (!user?.id) {
    redirect("/dashboard");
  }

  try {
    await requireAdmin(user.id);
  } catch {
    redirect("/dashboard");
  }

  return <AdminProviderKycClient />;
}