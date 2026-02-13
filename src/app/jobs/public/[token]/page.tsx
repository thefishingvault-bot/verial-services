import { eq, sql } from "drizzle-orm";
import Image from "next/image";
import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { jobRequestQuestions, jobRequests } from "@/db/schema";
import { db } from "@/lib/db";
import { parseCustomerJobDescription } from "@/lib/customer-job-meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PublicJobPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!token || token.length < 12 || !/^[a-zA-Z0-9_-]+$/.test(token)) {
    notFound();
  }

  const tokenNeedle = `%\"publicToken\":\"${token}\"%`;

  const job = await db.query.jobRequests.findFirst({
    where: sql`${jobRequests.description} like ${tokenNeedle}`,
    columns: {
      id: true,
      title: true,
      description: true,
      suburb: true,
      region: true,
    },
  });

  if (!job) {
    notFound();
  }

  const parsedDescription = parseCustomerJobDescription(job.description);

  const questions = await db.query.jobRequestQuestions.findMany({
    where: eq(jobRequestQuestions.jobRequestId, job.id),
    columns: {
      id: true,
      question: true,
      answer: true,
      createdAt: true,
    },
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6 md:px-6">
      <Card>
        <CardHeader>
          <CardTitle>{job.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{parsedDescription.description || "No description provided."}</p>
          <div className="text-muted-foreground">
            {job.suburb ?? "-"}, {job.region ?? "-"}
          </div>
          <div className="text-muted-foreground">
            Category: {parsedDescription.category} · Budget: {parsedDescription.budget} · Timing: {parsedDescription.timing}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Photos</CardTitle>
        </CardHeader>
        <CardContent>
          {parsedDescription.photoUrls.length === 0 ? (
            <p className="text-sm text-muted-foreground">No photos yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {parsedDescription.photoUrls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="relative h-28 overflow-hidden rounded-md border">
                  <Image src={url} alt="Job photo" fill className="object-cover" unoptimized />
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Public Q&A</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {questions.length === 0 ? (
            <p className="text-muted-foreground">No Q&A entries yet.</p>
          ) : (
            questions.map((item) => (
              <div key={item.id} className="rounded-md border p-3">
                <p className="font-medium">Q: {item.question}</p>
                <p className="mt-1 text-muted-foreground">A: {item.answer?.trim() || "Awaiting answer"}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
