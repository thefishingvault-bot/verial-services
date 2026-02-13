import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { jobQuotes, jobRequests, providers } from "@/db/schema";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const { jobId } = await params;
  if (!jobId) return new NextResponse("Missing jobId", { status: 400 });

  const provider = await db.query.providers.findFirst({
    where: eq(providers.userId, userId),
    columns: { id: true },
  });

  if (!provider) return new NextResponse("Provider account required", { status: 403 });

  const job = await db.query.jobRequests.findFirst({
    where: eq(jobRequests.id, jobId),
    columns: { id: true, status: true },
  });

  if (!job) return new NextResponse("Job not found", { status: 404 });
  if (job.status !== "open") return new NextResponse("Job is not open for quotes", { status: 400 });

  const body = (await req.json().catch(() => null)) as {
    amountTotal?: number;
    availability?: string;
    included?: string;
    excluded?: string;
    responseSpeedHours?: number;
  } | null;

  const amountTotal = Math.trunc(Number(body?.amountTotal ?? 0));
  if (!Number.isFinite(amountTotal) || amountTotal <= 0) {
    return new NextResponse("Invalid quote amount", { status: 400 });
  }

  const existing = await db.query.jobQuotes.findFirst({
    where: and(eq(jobQuotes.jobRequestId, jobId), eq(jobQuotes.providerId, provider.id)),
    columns: { id: true },
  });

  if (existing) {
    const [updated] = await db
      .update(jobQuotes)
      .set({
        amountTotal,
        availability: body?.availability?.trim() || null,
        included: body?.included?.trim() || null,
        excluded: body?.excluded?.trim() || null,
        responseSpeedHours: Math.max(1, Math.trunc(Number(body?.responseSpeedHours ?? 24))),
        status: "submitted",
        updatedAt: new Date(),
      })
      .where(eq(jobQuotes.id, existing.id))
      .returning();

    return NextResponse.json(updated);
  }

  const [created] = await db
    .insert(jobQuotes)
    .values({
      jobRequestId: jobId,
      providerId: provider.id,
      amountTotal,
      availability: body?.availability?.trim() || null,
      included: body?.included?.trim() || null,
      excluded: body?.excluded?.trim() || null,
      responseSpeedHours: Math.max(1, Math.trunc(Number(body?.responseSpeedHours ?? 24))),
      status: "submitted",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return NextResponse.json(created);
}
