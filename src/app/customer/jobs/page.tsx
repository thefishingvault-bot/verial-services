import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { desc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { jobQuotes, jobRequests } from "@/db/schema";
import {
  formatCanonicalJobStatus,
  isPaymentStatusRelevant,
  jobStatusFilterBucket,
  normalizeJobStatus,
  normalizePaymentStatus,
  parseCustomerJobDescription,
} from "@/lib/customer-job-meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JobsSearchParams = {
  status?: string;
  sort?: string;
};

function formatPostedDate(input: Date) {
  const now = Date.now();
  const diffMs = now - input.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return "Posted just now";
  if (diffHours < 24) return `Posted ${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `Posted ${diffDays}d ago`;

  return `Posted ${input.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })}`;
}

function makeJobsQuery(status: string, sort: string) {
  const query = new URLSearchParams({ status, sort });
  return `/customer/jobs?${query.toString()}`;
}

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

export default async function CustomerJobsPage({ searchParams }: { searchParams: Promise<JobsSearchParams> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const query = await searchParams;

  const filter =
    query.status === "open" ||
    query.status === "assigned" ||
    query.status === "completed" ||
    query.status === "closed" ||
    query.status === "cancelled"
      ? query.status
      : "all";

  const sort = query.sort === "oldest" ? "oldest" : "newest";

  let rows: Array<{
    id: string;
    title: string;
    description: string | null;
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
        description: true,
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
          description: true,
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

  let quoteCountByJobId = new Map<string, number>();
  if (rows.length > 0) {
    try {
      const jobIds = rows.map((row) => row.id);
      const quoteRows = await db.query.jobQuotes.findMany({
        where: inArray(jobQuotes.jobRequestId, jobIds),
        columns: {
          jobRequestId: true,
        },
      });

      quoteCountByJobId = quoteRows.reduce((map, quote) => {
        map.set(quote.jobRequestId, (map.get(quote.jobRequestId) ?? 0) + 1);
        return map;
      }, new Map<string, number>());
    } catch {
      quoteCountByJobId = new Map<string, number>();
    }
  }

  const normalizedRows = rows
    .map((job) => {
      const quoteCount = quoteCountByJobId.get(job.id) ?? 0;
      const normalizedStatus = normalizeJobStatus(job.status, quoteCount);
      const normalizedPaymentStatus = normalizePaymentStatus(job.paymentStatus, normalizedStatus);

      return {
        ...job,
        quoteCount,
        parsedDescription: parseCustomerJobDescription(job.description),
        normalizedStatus,
        normalizedPaymentStatus,
      };
    })
    .filter((job) => (filter === "all" ? true : jobStatusFilterBucket(job.normalizedStatus) === filter))
    .sort((a, b) =>
      sort === "oldest"
        ? a.createdAt.getTime() - b.createdAt.getTime()
        : b.createdAt.getTime() - a.createdAt.getTime(),
    );

  const filterItems = [
    { key: "all", label: "All" },
    { key: "open", label: "Open" },
    { key: "assigned", label: "Assigned" },
    { key: "completed", label: "Completed" },
    { key: "closed", label: "Closed" },
    { key: "cancelled", label: "Cancelled" },
  ] as const;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 md:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your jobs</h1>
        <Button asChild>
          <Link href="/customer/jobs/new">Post job</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-wrap gap-2">
            {filterItems.map((item) => (
              <Button
                key={item.key}
                variant={filter === item.key ? "default" : "outline"}
                size="sm"
                asChild
              >
                <Link href={makeJobsQuery(item.key, sort)}>{item.label}</Link>
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant={sort === "newest" ? "default" : "outline"} asChild>
              <Link href={makeJobsQuery(filter, "newest")}>Newest</Link>
            </Button>
            <Button size="sm" variant={sort === "oldest" ? "default" : "outline"} asChild>
              <Link href={makeJobsQuery(filter, "oldest")}>Oldest</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Job requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {normalizedRows.length === 0 ? (
            <div className="space-y-3 rounded-md border border-dashed p-6 text-center">
              <p className="text-base font-medium">No jobs yet</p>
              <p className="text-sm text-muted-foreground">Post a job to start getting quotes from local service providers.</p>
              <Button asChild className="h-11 px-6">
                <Link href="/customer/jobs/new">Post a job</Link>
              </Button>
            </div>
          ) : (
            normalizedRows.map((job) => (
              <Link
                key={job.id}
                href={`/customer/jobs/${job.id}`}
                className="block cursor-pointer rounded-md border p-3 transition-colors hover:bg-muted/40 active:bg-muted/60"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-medium">{job.title}</div>
                    <div className="text-xs text-muted-foreground">{job.region ?? "-"}, {job.suburb ?? "-"}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatPostedDate(job.createdAt)} · Quotes: {job.quoteCount}
                      {job.parsedDescription.category ? ` · ${job.parsedDescription.category}` : ""}
                      {job.parsedDescription.timing ? ` · ${job.parsedDescription.timing}` : ""}
                    </div>
                  </div>
                  <div className="space-y-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Badge>{formatCanonicalJobStatus(job.normalizedStatus)}</Badge>
                      {isPaymentStatusRelevant(job.normalizedPaymentStatus) && (
                        <Badge variant="secondary">{job.normalizedPaymentStatus}</Badge>
                      )}
                    </div>
                    <div className="text-xs font-medium text-muted-foreground">View job →</div>
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
