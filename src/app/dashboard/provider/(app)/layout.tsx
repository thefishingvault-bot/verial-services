import { requireProvider } from "@/lib/auth-guards";
import { ProviderShell } from "../provider-shell";

export default async function ProviderAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireProvider();
  return <ProviderShell>{children}</ProviderShell>;
}
