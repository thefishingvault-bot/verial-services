import { Suspense } from "react";
import { requireProvider } from "@/lib/auth-guards";
import ProviderBillingClient from "@/components/provider/provider-billing-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProviderBillingPage() {
  await requireProvider();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Billing</h1>
        <p className="text-muted-foreground mt-2">Manage your subscription plan and billing details.</p>
      </div>

      <Suspense fallback={<div>Loading billing...</div>}>
        <ProviderBillingClient />
      </Suspense>
    </div>
  );
}
