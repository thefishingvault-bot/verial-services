import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { JobPhotosGallery } from "@/components/jobs/job-photos-gallery";
import { ProviderJobView } from "@/components/job-requests/provider-job-view";
import { PageHeaderNav } from "@/components/nav/page-header-nav";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { jobQuotes, jobRequestQuestions, jobRequests, providers } from "@/db/schema";
import { formatCustomerJobCategory, parseCustomerJobDescription } from "@/lib/customer-job-meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProviderJobRequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const query = await searchParams;
  const initialTab = query.tab === "quote" || query.tab === "qa" ? query.tab : "overview";

  const provider = await db.query.providers.findFirst({
    where: eq(providers.userId, userId),
    columns: { id: true, userId: true },
  });

  if (!provider) redirect("/dashboard");

  const { id } = await params;

  const job = await db.query.jobRequests.findFirst({
    where: eq(jobRequests.id, id),
    columns: {
      id: true,
      customerUserId: true,
      title: true,
      description: true,
      region: true,
      suburb: true,
      status: true,
      paymentStatus: true,
      assignedProviderId: true,
      remainingAmount: true,
      createdAt: true,
    },
  });

  if (!job) notFound();

  const myQuote = await db.query.jobQuotes.findFirst({
    where: and(eq(jobQuotes.jobRequestId, id), eq(jobQuotes.providerId, provider.id)),
    columns: {
      amountTotal: true,
      availability: true,
      included: true,
      excluded: true,
      responseSpeedHours: true,
      status: true,
    },
  });

  const questions = await db.query.jobRequestQuestions.findMany({
    where: eq(jobRequestQuestions.jobRequestId, id),
    columns: { id: true, question: true, answer: true, createdAt: true },
  });

  const canEditQuote = job.status === "open";
  const isAssignedProvider = job.assignedProviderId === userId;

  if (!canEditQuote && !isAssignedProvider && !myQuote) {
    notFound();
  }

  const parsedDescription = parseCustomerJobDescription(job.description);
  const categoryLabel = formatCustomerJobCategory(
    parsedDescription.category,
    parsedDescription.categoryId,
    parsedDescription.otherServiceText,
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 md:px-6">
      <PageHeaderNav
        title="Job request"
        backHref="/dashboard/provider"
        crumbs={[
          { label: "Dashboard", href: "/dashboard/provider" },
          { label: "Job requests", href: "/provider/job-requests" },
          { label: "View job" },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="line-clamp-2 wrap-anywhere">{job.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="whitespace-pre-wrap wrap-anywhere">{parsedDescription.description || "No description provided."}</p>
          <div className="flex flex-wrap gap-2">
            <Badge>{job.status}</Badge>
            <Badge variant="secondary">{job.paymentStatus}</Badge>
            <span className="text-muted-foreground wrap-anywhere">Category: {categoryLabel}</span>
            <span className="text-muted-foreground wrap-anywhere">{job.suburb ?? "-"}, {job.region ?? "-"}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Photos</CardTitle>
        </CardHeader>
        <CardContent>
          <JobPhotosGallery
            photos={parsedDescription.photoUrls}
            altPrefix="Job photo"
            variant="detail"
            onEmpty={
              <div className="flex h-44 items-center justify-center rounded-md border bg-linear-to-br from-muted to-muted/40 p-4 text-center">
                <div className="space-y-2">
                  <p className="text-sm font-medium">No photos provided</p>
                  <p className="text-xs text-muted-foreground">Ask a question if you need more context before quoting.</p>
                </div>
              </div>
            }
          />
        </CardContent>
      </Card>

      <ProviderJobView
        jobId={job.id}
        status={job.status}
        paymentStatus={job.paymentStatus}
        myQuote={myQuote ?? null}
        canEditQuote={canEditQuote}
        isAssignedProvider={isAssignedProvider}
        remainingAmount={job.remainingAmount}
        questions={questions}
        initialTab={initialTab}
      />
    </div>
  );
}
