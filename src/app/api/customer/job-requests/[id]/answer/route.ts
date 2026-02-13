import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { jobRequestQuestions, jobRequests } from "@/db/schema";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { questionId?: string; answer?: string } | null;

  const questionId = body?.questionId?.trim();
  const answer = body?.answer?.trim();
  if (!questionId || !answer) return new NextResponse("Missing questionId or answer", { status: 400 });

  const job = await db.query.jobRequests.findFirst({
    where: and(eq(jobRequests.id, id), eq(jobRequests.customerUserId, userId)),
    columns: { id: true },
  });
  if (!job) return new NextResponse("Job not found", { status: 404 });

  const [updated] = await db
    .update(jobRequestQuestions)
    .set({
      answer,
      answeredByUserId: userId,
      updatedAt: new Date(),
    })
    .where(and(eq(jobRequestQuestions.id, questionId), eq(jobRequestQuestions.jobRequestId, id)))
    .returning();

  if (!updated) return new NextResponse("Question not found", { status: 404 });

  return NextResponse.json(updated);
}
