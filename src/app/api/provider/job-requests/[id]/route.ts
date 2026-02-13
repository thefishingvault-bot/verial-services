import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { jobQuotes, jobRequestInvites, jobRequestQuestions, jobRequests, providers } from "@/db/schema";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const provider = await db.query.providers.findFirst({
    where: eq(providers.userId, userId),
    columns: { id: true },
  });
  if (!provider) return new NextResponse("Provider account required", { status: 403 });

  const { id } = await params;

  const invite = await db.query.jobRequestInvites.findFirst({
    where: and(
      eq(jobRequestInvites.jobRequestId, id),
      eq(jobRequestInvites.providerId, provider.id),
      inArray(jobRequestInvites.status, ["pending", "accepted"]),
    ),
    columns: { id: true },
  });

  const job = await db.query.jobRequests.findFirst({
    where: eq(jobRequests.id, id),
  });

  if (!job) return new NextResponse("Not found", { status: 404 });
  const canView = job.status === "open" || job.assignedProviderId === userId || !!invite;
  if (!canView) return new NextResponse("Not found", { status: 404 });

  const [quotes, questions] = await Promise.all([
    db.query.jobQuotes.findMany({ where: eq(jobQuotes.jobRequestId, id) }),
    db.query.jobRequestQuestions.findMany({ where: eq(jobRequestQuestions.jobRequestId, id) }),
  ]);

  return NextResponse.json({ job, quotes, questions, isInvited: !!invite });
}
