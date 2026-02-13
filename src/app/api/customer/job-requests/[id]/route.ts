import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { jobQuotes, jobRequestInvites, jobRequestQuestions, jobRequests } from "@/db/schema";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const job = await db.query.jobRequests.findFirst({
    where: and(eq(jobRequests.id, id), eq(jobRequests.customerUserId, userId)),
  });

  if (!job) return new NextResponse("Not found", { status: 404 });

  const [quotes, questions, invites] = await Promise.all([
    db.query.jobQuotes.findMany({
      where: eq(jobQuotes.jobRequestId, id),
      with: { provider: { columns: { id: true, businessName: true, handle: true } } },
    }),
    db.query.jobRequestQuestions.findMany({ where: eq(jobRequestQuestions.jobRequestId, id) }),
    db.query.jobRequestInvites.findMany({
      where: eq(jobRequestInvites.jobRequestId, id),
      with: { provider: { columns: { id: true, businessName: true, handle: true } } },
    }),
  ]);

  return NextResponse.json({ job, quotes, questions, invites });
}
