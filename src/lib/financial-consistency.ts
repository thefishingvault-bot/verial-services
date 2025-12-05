import { db } from "@/lib/db";
import { financialAuditLogs } from "@/db/schema";

export async function logFinancialAudit(params: {
  providerId: string;
  bookingId?: string | null;
  issue: string;
  expectedValue?: string | null;
  actualValue?: string | null;
}) {
  const { providerId, bookingId = null, issue, expectedValue = null, actualValue = null } = params;
  await db.insert(financialAuditLogs).values({
    providerId,
    bookingId,
    issue,
    expectedValue,
    actualValue,
  });
}
