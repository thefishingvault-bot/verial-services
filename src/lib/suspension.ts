import { providers } from "@/db/schema";
import { and, eq, gt, isNotNull, lte, or, type SQL } from "drizzle-orm";

export type ProviderSuspensionFields = Pick<
  typeof providers.$inferSelect,
  "isSuspended" | "suspensionStartDate" | "suspensionEndDate"
>;

export function isProviderCurrentlySuspended(
  provider: ProviderSuspensionFields,
  now: Date = new Date(),
) {
  if (!provider.isSuspended) return false;

  const start = provider.suspensionStartDate ? new Date(provider.suspensionStartDate) : null;
  const end = provider.suspensionEndDate ? new Date(provider.suspensionEndDate) : null;

  const startReached = !start || start.getTime() <= now.getTime();
  const notEnded = !end || end.getTime() > now.getTime();

  return startReached && notEnded;
}

/**
 * SQL predicate for places that used `eq(providers.isSuspended, false)`.
 *
 * Allows providers that are:
 * - not suspended, OR
 * - "scheduled" (startDate in the future), OR
 * - "expired" (endDate in the past)
 */
export function providerNotCurrentlySuspendedWhere(now: Date = new Date()): SQL {
  return or(
    eq(providers.isSuspended, false),
    and(
      eq(providers.isSuspended, true),
      isNotNull(providers.suspensionStartDate),
      gt(providers.suspensionStartDate, now),
    ),
    and(
      eq(providers.isSuspended, true),
      isNotNull(providers.suspensionEndDate),
      lte(providers.suspensionEndDate, now),
    ),
  );
}
