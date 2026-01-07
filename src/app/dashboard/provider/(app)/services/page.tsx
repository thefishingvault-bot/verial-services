import { requireProvider } from "@/lib/auth-guards";
import { ProviderServicesClient } from "./provider-services-client";

export default async function ProviderServicesPage() {
  await requireProvider({ allowUnapproved: true });
  return <ProviderServicesClient />;
}
