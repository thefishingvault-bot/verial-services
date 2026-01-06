import { requireProvider } from "@/lib/auth-guards";
import { ProviderProfileForm } from "@/components/profile/provider-profile-form";

export default async function ProviderProfilePage() {
  await requireProvider();
  return <ProviderProfileForm />;
}
