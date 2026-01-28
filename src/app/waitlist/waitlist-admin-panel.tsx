import { sql } from "drizzle-orm";

import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { waitlistSignups } from "@/db/schema";
import { Card } from "@/components/ui/card";
import { WaitlistAdminClient } from "./waitlist-admin-client";

export async function WaitlistAdminPanel() {
  const admin = await requireAdmin();
  if (!admin.isAdmin) return null;

  const [stats] = await db
    .select({
      total: sql<number>`cast(count(*) as int)`.as("total"),
      providers: sql<number>`cast(count(*) filter (where ${waitlistSignups.role} = 'provider') as int)`.as(
        "providers",
      ),
      customers: sql<number>`cast(count(*) filter (where ${waitlistSignups.role} = 'customer') as int)`.as(
        "customers",
      ),
    })
    .from(waitlistSignups);

  return (
    <Card className="mb-5 p-6">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold">Admin</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Waitlist totals: {stats?.total ?? 0} (providers {stats?.providers ?? 0}, customers {stats?.customers ?? 0})
          </p>
        </div>

        <WaitlistAdminClient />
      </div>
    </Card>
  );
}
