import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CustomerJobView } from "@/components/job-requests/customer-job-view";
import { JobPhotosGallery } from "@/components/jobs/job-photos-gallery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { jobQuotes, jobRequestQuestions, jobRequests, reviews } from "@/db/schema";
import { scoreQuote } from "@/lib/job-requests";
import {
  formatCanonicalJobStatus,
  isPaymentStatusRelevant,
  normalizeJobStatus,
  normalizePaymentStatus,
  parseCustomerJobDescription,
} from "@/lib/customer-job-meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default async function CustomerJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;

  if (!isUuid(id)) {
    notFound();
  }

  const job = await db.query.jobRequests.findFirst({
    where: and(eq(jobRequests.id, id), eq(jobRequests.customerUserId, userId)),
    columns: {
      id: true,
      title: true,
      description: true,
      region: true,
      suburb: true,
      status: true,
      paymentStatus: true,
      acceptedQuoteId: true,
      totalPrice: true,
      depositAmount: true,
      remainingAmount: true,
      createdAt: true,
    },
  });

  if (!job) notFound();

  const parsedDescription = parseCustomerJobDescription(job.description);

  const quotes = await db.query.jobQuotes.findMany({
    where: eq(jobQuotes.jobRequestId, id),
    columns: {
      id: true,
      providerId: true,
      amountTotal: true,
      availability: true,
      included: true,
      excluded: true,
      responseSpeedHours: true,
      status: true,
    },
    with: {
      provider: {
        columns: {
          businessName: true,
          handle: true,
        },
      },
    },
  });

  const questions = await db.query.jobRequestQuestions.findMany({
    where: eq(jobRequestQuestions.jobRequestId, id),
    columns: {
      id: true,
      question: true,
      answer: true,
      askedByUserId: true,
      createdAt: true,
    },
  });

  const providerIds = [...new Set(quotes.map((quote) => quote.providerId))];
  const ratings = providerIds.length
    ? await db
        .select({
          providerId: reviews.providerId,
          avgRating: sql<number>`coalesce(avg(${reviews.rating}), 0)`,
        })
        .from(reviews)
        .where(inArray(reviews.providerId, providerIds))
        .groupBy(reviews.providerId)
    : [];

  const ratingMap = new Map(ratings.map((row) => [row.providerId, Number(row.avgRating ?? 0)]));

  const minAmount = quotes.length ? Math.min(...quotes.map((quote) => quote.amountTotal)) : 0;
  const maxAmount = quotes.length ? Math.max(...quotes.map((quote) => quote.amountTotal)) : 1;
  const maxResponseHours = quotes.length
    ? Math.max(...quotes.map((quote) => Math.max(1, quote.responseSpeedHours ?? 24)))
    : 24;

  const quoteRows = quotes.map((quote) => {
    const rating = ratingMap.get(quote.providerId) ?? 0;
    const score = scoreQuote({
      rating,
      amountTotal: quote.amountTotal,
      minAmount,
      maxAmount,
      responseSpeedHours: quote.responseSpeedHours,
      maxResponseHours,
    });

    return {
      id: quote.id,
      providerId: quote.providerId,
      providerName: quote.provider.businessName,
      providerHandle: quote.provider.handle,
      amountTotal: quote.amountTotal,
      availability: quote.availability,
      included: quote.included,
      excluded: quote.excluded,
      responseSpeedHours: quote.responseSpeedHours,
      status: quote.status,
      rating,
      score,
    };
  });

  const bestValueQuoteId = quoteRows.length
    ? quoteRows.reduce((best, current) => (current.amountTotal < best.amountTotal ? current : best)).id
    : null;

  const fastestQuoteId = quoteRows.length
    ? quoteRows.reduce((best, current) => {
        const bestHours = best.responseSpeedHours ?? 9999;
        const currentHours = current.responseSpeedHours ?? 9999;
        return currentHours < bestHours ? current : best;
      }).id
    : null;

  const topRatedQuoteId = quoteRows.length
    ? quoteRows.reduce((best, current) => (current.rating > best.rating ? current : best)).id
    : null;

  const normalizedStatus = normalizeJobStatus(job.status, quoteRows.length);
  const normalizedPaymentStatus = normalizePaymentStatus(job.paymentStatus, normalizedStatus);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6 md:px-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <CardTitle className="line-clamp-2 wrap-anywhere">{job.title}</CardTitle>
              <div className="text-sm text-muted-foreground">{job.region ?? "-"}, {job.suburb ?? "-"}</div>
            </div>
            <div className="flex gap-2">
              <Badge>{formatCanonicalJobStatus(normalizedStatus)}</Badge>
              {isPaymentStatusRelevant(normalizedPaymentStatus) && (
                <Badge variant="secondary">{normalizedPaymentStatus}</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="whitespace-pre-wrap wrap-anywhere">
            {parsedDescription.description || "No description provided."}
          </p>
          <div className="flex flex-wrap gap-3 text-muted-foreground">
            <span>Category: {parsedDescription.category}</span>
            <span>Budget: {parsedDescription.budget}</span>
            <span>Timing: {parsedDescription.timing}{parsedDescription.requestedDate ? ` (${parsedDescription.requestedDate})` : ""}</span>
            <span>Quotes: {quoteRows.length}</span>
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
            onEmpty={
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">No photos yet.</p>
                <Button variant="outline" asChild>
                  <Link href={`/customer/jobs/${job.id}/edit`}>Add photos</Link>
                </Button>
              </div>
            }
          />
        </CardContent>
      </Card>

      <CustomerJobView
        job={{
          id: job.id,
          status: job.status,
          paymentStatus: job.paymentStatus,
          acceptedQuoteId: job.acceptedQuoteId,
          totalPrice: job.totalPrice,
          depositAmount: job.depositAmount,
          remainingAmount: job.remainingAmount,
        }}
        quoteCount={quoteRows.length}
        quotes={quoteRows}
        bestValueQuoteId={bestValueQuoteId}
        fastestQuoteId={fastestQuoteId}
        topRatedQuoteId={topRatedQuoteId}
        questions={questions}
      />
    </div>
  );
}
