import { requireProvider } from "@/lib/auth-guards";
import { getProviderAccessStateForUserId } from "@/lib/provider-access";
import { ProviderSuspensionBanner } from "@/components/dashboard/provider-suspension-banner";
import { ProviderShell } from "../provider-shell";

export default async function ProviderAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, role } = await requireProvider();

  const access = role === "provider" ? await getProviderAccessStateForUserId(userId) : null;
  const state = access?.state ?? null;

  return (
    <>
      <ProviderSuspensionBanner state={state} />
      <ProviderShell>{children}</ProviderShell>
    </>
  );
}
