import { eq } from "drizzle-orm";

import { providers } from "@/db/schema";
import { db } from "@/lib/db";
import { requireProvider } from "@/lib/auth-guards";
import { ProviderEditServiceClient } from "./provider-edit-service-client";

export default async function ProviderEditServicePage() {
  const { userId } = await requireProvider({ allowUnapproved: true });

  const provider = await db.query.providers.findFirst({
    where: eq(providers.userId, userId),
    columns: { status: true },
  });

  if (!provider) {
    return <ProviderEditServiceClient providerStatus={"pending"} />;
  }

  return <ProviderEditServiceClient providerStatus={provider.status} />;
}
