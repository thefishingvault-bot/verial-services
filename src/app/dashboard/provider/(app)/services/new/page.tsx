import { eq } from "drizzle-orm";

import { providers } from "@/db/schema";
import { db } from "@/lib/db";
import { requireProvider } from "@/lib/auth-guards";
import { ProviderServiceNewClient } from "./provider-service-new-client";

export default async function ProviderNewServicePage() {
  const { userId } = await requireProvider({ allowUnapproved: true });

  const provider = await db.query.providers.findFirst({
    where: eq(providers.userId, userId),
    columns: { status: true },
  });

  // requireProvider should have guaranteed this, but keep it safe.
  if (!provider) {
    return <ProviderServiceNewClient providerStatus={"pending"} blockedReason="Provider not found" />;
  }

  return <ProviderServiceNewClient providerStatus={provider.status} />;
}
