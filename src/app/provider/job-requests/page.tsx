import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { desc, eq, or } from "drizzle-orm";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { jobQuotes, jobRequests, providers } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProviderJobRequestsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const provider = await db.query.providers.findFirst({
    where: eq(providers.userId, userId),
    columns: { id: true },
  });

  if (!provider) redirect("/dashboard");

  const jobs = await db.query.jobRequests.findMany({
    where: or(eq(jobRequests.status, "open"), eq(jobRequests.assignedProviderId, userId)),
    columns: {
      id: true,
      title: true,
      suburb: true,
      region: true,
      status: true,
      paymentStatus: true,
      createdAt: true,
      assignedProviderId: true,
    },
    orderBy: [desc(jobRequests.createdAt)],
    limit: 100,
  });

  const myQuotes = await db.query.jobQuotes.findMany({
    where: eq(jobQuotes.providerId, provider.id),
    columns: { id: true, jobRequestId: true, status: true, amountTotal: true },
  });

  const quoteMap = new Map(myQuotes.map((quote) => [quote.jobRequestId, quote]));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 md:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Job requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobs.map((job) => {
            const myQuote = quoteMap.get(job.id);
            return (
              <Link key={job.id} href={`/provider/job-requests/${job.id}`} className="block rounded-md border p-3 hover:bg-muted/40">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{job.title}</div>
                    <div className="text-xs text-muted-foreground">{job.suburb ?? "-"}, {job.region ?? "-"}</div>
                  </div>
                  <div className="flex gap-2">
                    <Badge>{job.status}</Badge>
                    <Badge variant="secondary">{job.paymentStatus}</Badge>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {myQuote
                    ? `Your quote: NZ$${(myQuote.amountTotal / 100).toFixed(2)} (${myQuote.status})`
                    : job.status === "open"
                      ? "No quote submitted yet"
                      : "Job assigned"}
                </div>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
