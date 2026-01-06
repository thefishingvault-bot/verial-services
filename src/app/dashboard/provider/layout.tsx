import { requireCustomer } from "@/lib/auth-guards";

export default async function ProviderDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Allow signed-in users to access /dashboard/provider/kyc during onboarding.
  // Provider dashboard pages remain protected via the nested (app) layout.
  await requireCustomer();

  return <>{children}</>;
}
