import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { jobRequestInvites, jobRequestQuestions, jobRequests, providers } from "@/db/schema";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const provider = await db.query.providers.findFirst({ where: eq(providers.userId, userId), columns: { id: true } });
  if (!provider) return new NextResponse("Provider account required", { status: 403 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { question?: string } | null;
  const question = body?.question?.trim() ?? "";
  if (!question) return new NextResponse("Question is required", { status: 400 });

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
    columns: { id: true, status: true },
  });

  if (!job) return new NextResponse("Job not found", { status: 404 });
  if (!invite && job.status !== "open") return new NextResponse("Job not available", { status: 403 });

  const [created] = await db
    .insert(jobRequestQuestions)
    .values({
      jobRequestId: id,
      askedByUserId: userId,
      question,
      updatedAt: new Date(),
    })
    .returning();

  return NextResponse.json(created);
}
