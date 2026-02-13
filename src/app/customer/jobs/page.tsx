import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { jobRequests } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const pg = error as { code?: string; message?: string };
  if (pg.code === "42703") return true;
  return typeof pg.message === "string" && /column .* does not exist/i.test(pg.message);
}

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const pg = error as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  if (pg.code === "42P01" || pg.cause?.code === "42P01") return true;
  if (typeof pg.message === "string" && /relation .* does not exist/i.test(pg.message)) return true;
  return typeof pg.cause?.message === "string" && /relation .* does not exist/i.test(pg.cause.message);
}

export default async function CustomerJobsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  let rows: Array<{
    id: string;
    title: string;
    status: string;
    paymentStatus: string;
    suburb: string | null;
    region: string | null;
    createdAt: Date;
  }>;

  try {
    rows = await db.query.jobRequests.findMany({
      where: eq(jobRequests.customerUserId, userId),
      columns: {
        id: true,
        title: true,
        status: true,
        paymentStatus: true,
        suburb: true,
        region: true,
        createdAt: true,
      },
      orderBy: [desc(jobRequests.createdAt)],
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      rows = [];
    } else {
      if (!isMissingColumnError(error)) {
        throw error;
      }

      const fallbackRows = await db.query.jobRequests.findMany({
        where: eq(jobRequests.customerUserId, userId),
        columns: {
          id: true,
          title: true,
          status: true,
          paymentStatus: true,
          createdAt: true,
        },
        orderBy: [desc(jobRequests.createdAt)],
      });

      rows = fallbackRows.map((job) => ({
        ...job,
        suburb: null,
        region: null,
      }));
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 md:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your jobs</h1>
        <Button asChild>
          <Link href="/customer/jobs/new">Post job</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Job requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs yet.</p>
          ) : (
            rows.map((job) => (
              <Link key={job.id} href={`/customer/jobs/${job.id}`} className="block rounded-md border p-3 hover:bg-muted/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{job.title}</div>
                    <div className="text-xs text-muted-foreground">{job.suburb ?? "-"}, {job.region ?? "-"}</div>
                  </div>
                  <div className="flex gap-2">
                    <Badge>{job.status}</Badge>
                    <Badge variant="secondary">{job.paymentStatus}</Badge>
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
