import { auth } from "@clerk/nextjs/server";
import { desc, eq, inArray, or } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db";
import { jobQuotes, jobRequests, providers } from "@/db/schema";
import {
  normalizeJobStatus,
  parseCustomerJobDescription,
  type CanonicalJobStatus,
} from "@/lib/customer-job-meta";
import { ProviderJobFeedList } from "./_components/provider-job-feed-list";
import type { ProviderFeedFilter, ProviderFeedJob, ProviderFeedSort, ProviderQuoteState } from "./_components/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProviderJobFeedSearchParams = {
  filter?: string;
  sort?: string;
};

function normalizeFilter(input: string | undefined): ProviderFeedFilter {
  if (input === "open" || input === "assigned" || input === "completed" || input === "saved") return input;
  return "all";
}

function normalizeSort(input: string | undefined): ProviderFeedSort {
  return input === "oldest" ? "oldest" : "newest";
}

function mapQuoteState(status: string | undefined): ProviderQuoteState {
  if (status === "submitted") return "submitted";
  if (status === "accepted") return "accepted";
  if (status === "rejected") return "rejected";
  return "none";
}

function canProviderSeeInFeed(jobStatus: CanonicalJobStatus, hasMyQuote: boolean, isAssignedToMe: boolean) {
  if (jobStatus === "Open" || jobStatus === "Quoting") return true;
  if (jobStatus === "Assigned" || jobStatus === "InProgress") {
    return isAssignedToMe || hasMyQuote;
  }
  return false;
}

export default async function ProviderJobRequestsPage({
  searchParams,
}: {
  searchParams: Promise<ProviderJobFeedSearchParams>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const query = await searchParams;
  const initialFilter = normalizeFilter(query.filter);
  const initialSort = normalizeSort(query.sort);

  const provider = await db.query.providers.findFirst({
    where: eq(providers.userId, userId),
    columns: { id: true, categories: true },
  });

  if (!provider) redirect("/dashboard");

  const providerCategories = new Set(provider.categories ?? []);
  if (providerCategories.size === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 md:px-6">
        <h1 className="text-xl font-semibold">Job requests</h1>
        <Card>
          <CardContent className="space-y-3 p-6 text-center">
            <p className="text-base font-medium">Set your service categories to see matching jobs</p>
            <p className="text-sm text-muted-foreground">
              Add at least one category in your provider profile so we can match relevant requests.
            </p>
            <div>
              <Button asChild>
                <Link href="/dashboard/provider/profile">Update categories</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const myQuotes = await db.query.jobQuotes.findMany({
    where: eq(jobQuotes.providerId, provider.id),
    columns: { id: true, jobRequestId: true, status: true },
  });

  const quotedJobIds = myQuotes.map((quote) => quote.jobRequestId);

  const visibilityWhere = quotedJobIds.length > 0
    ? or(
        eq(jobRequests.status, "open"),
        eq(jobRequests.assignedProviderId, userId),
        inArray(jobRequests.id, quotedJobIds),
      )
    : or(eq(jobRequests.status, "open"), eq(jobRequests.assignedProviderId, userId));

  const jobs = await db.query.jobRequests.findMany({
    where: visibilityWhere,
    columns: {
      id: true,
      title: true,
      description: true,
      suburb: true,
      region: true,
      status: true,
      createdAt: true,
      assignedProviderId: true,
    },
    orderBy: [desc(jobRequests.createdAt)],
    limit: 100,
  });

  let quoteCountByJobId = new Map<string, number>();
  if (jobs.length > 0) {
    const quoteRows = await db.query.jobQuotes.findMany({
      where: inArray(jobQuotes.jobRequestId, jobs.map((job) => job.id)),
      columns: { jobRequestId: true },
    });

    quoteCountByJobId = quoteRows.reduce((map, quote) => {
      map.set(quote.jobRequestId, (map.get(quote.jobRequestId) ?? 0) + 1);
      return map;
    }, new Map<string, number>());
  }

  const myQuoteByJobId = new Map(myQuotes.map((quote) => [quote.jobRequestId, quote]));
  const assignedByJobId = new Map(jobs.map((job) => [job.id, job.assignedProviderId === userId]));

  const feedJobs: ProviderFeedJob[] = jobs
    .map((job) => {
      const quoteCount = quoteCountByJobId.get(job.id) ?? 0;
      const jobStatus = normalizeJobStatus(job.status, quoteCount);
      const myQuote = myQuoteByJobId.get(job.id);
      const parsed = parseCustomerJobDescription(job.description);

      return {
        id: job.id,
        title: job.title,
        description: parsed.description,
        suburb: job.suburb,
        region: job.region,
        createdAt: job.createdAt.toISOString(),
        category: parsed.category,
        budget: parsed.budget,
        timing: parsed.timing,
        categoryId: parsed.categoryId,
        jobStatus,
        quoteState: mapQuoteState(myQuote?.status),
        photos: parsed.photoUrls.map((url, index) => ({ url, sortOrder: index })),
      };
    })
    .filter((job) => !!job.categoryId && providerCategories.has(job.categoryId))
    .filter((job) => {
      const hasMyQuote = job.quoteState !== "none";
      const isAssignedToMe = assignedByJobId.get(job.id) ?? false;
      return canProviderSeeInFeed(job.jobStatus, hasMyQuote, isAssignedToMe);
    });

  return (
    <ProviderJobFeedList jobs={feedJobs} initialFilter={initialFilter} initialSort={initialSort} />
  );
}
