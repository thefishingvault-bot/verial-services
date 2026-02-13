import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { jobRequestInvites, providers } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProviderInvitesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const provider = await db.query.providers.findFirst({
    where: eq(providers.userId, userId),
    columns: { id: true },
  });
  if (!provider) redirect("/dashboard");

  const invites = await db.query.jobRequestInvites.findMany({
    where: and(
      eq(jobRequestInvites.providerId, provider.id),
      inArray(jobRequestInvites.status, ["pending", "accepted"]),
    ),
    with: {
      jobRequest: {
        columns: { id: true, title: true, status: true, suburb: true, region: true },
      },
    },
    orderBy: [desc(jobRequestInvites.createdAt)],
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 md:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Job invites</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invites yet.</p>
          ) : (
            invites.map((invite) => (
              <Link key={invite.id} href={`/provider/job-requests/${invite.jobRequest.id}`} className="block rounded-md border p-3 hover:bg-muted/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{invite.jobRequest.title}</div>
                    <div className="text-xs text-muted-foreground">{invite.jobRequest.suburb ?? "-"}, {invite.jobRequest.region ?? "-"}</div>
                  </div>
                  <div className="flex gap-2">
                    <Badge>{invite.status}</Badge>
                    <Badge variant="secondary">{invite.jobRequest.status}</Badge>
                  </div>
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
