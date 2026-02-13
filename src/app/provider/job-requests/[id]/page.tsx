import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { ProviderJobView } from "@/components/job-requests/provider-job-view";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { jobQuotes, jobRequestQuestions, jobRequests, providers } from "@/db/schema";
import { parseCustomerJobDescription } from "@/lib/customer-job-meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProviderJobRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

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

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 md:px-6">
      <Card>
        <CardHeader>
          <CardTitle>{job.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{parsedDescription.description || "No description provided."}</p>
          <div className="flex flex-wrap gap-2">
            <Badge>{job.status}</Badge>
            <Badge variant="secondary">{job.paymentStatus}</Badge>
            <span className="text-muted-foreground">{job.suburb ?? "-"}, {job.region ?? "-"}</span>
          </div>
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
      />
    </div>
  );
}
