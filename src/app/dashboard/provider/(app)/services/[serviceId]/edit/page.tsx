import { eq } from "drizzle-orm";

import { providers } from "@/db/schema";
import { db } from "@/lib/db";
import { requireProvider } from "@/lib/auth-guards";
import { ProviderEditServiceClient } from "./provider-edit-service-client";

export default async function ProviderEditServicePage() {
  const { userId } = await requireProvider({ allowUnapproved: true });

  const provider = await db.query.providers.findFirst({
    where: eq(providers.userId, userId),
    columns: { status: true, baseRegion: true, baseSuburb: true, serviceRadiusKm: true, chargesGst: true },
  });

  if (!provider) {
    return (
      <ProviderEditServiceClient
        providerStatus={"pending"}
        providerBaseRegion={null}
        providerBaseSuburb={null}
        providerServiceRadiusKm={10}
        providerChargesGst={true}
        blockedReason="Provider not found"
      />
    );
  }

  return (
    <ProviderEditServiceClient
      providerStatus={provider.status}
      providerBaseRegion={provider.baseRegion}
      providerBaseSuburb={provider.baseSuburb}
      providerServiceRadiusKm={provider.serviceRadiusKm}
      providerChargesGst={provider.chargesGst}
    />
  );
}
