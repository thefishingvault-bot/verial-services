import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { jobQuotes, jobRequestInvites, jobRequests, providers } from "@/db/schema";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const rate = await enforceRateLimit(req, {
    userId,
    resource: "provider-job-quote",
    limit: 30,
    windowSeconds: 60,
  });
  if (!rate.success) return rateLimitResponse(rate.retryAfter);

  const provider = await db.query.providers.findFirst({ where: eq(providers.userId, userId), columns: { id: true } });
  if (!provider) return new NextResponse("Provider account required", { status: 403 });

  const { id } = await params;

  const job = await db.query.jobRequests.findFirst({
    where: eq(jobRequests.id, id),
    columns: { id: true, status: true, assignedProviderId: true, customerUserId: true },
  });
  if (!job) return new NextResponse("Job not found", { status: 404 });

  if (job.customerUserId === userId) {
    return new NextResponse("You cannot quote on your own job", { status: 403 });
  }

  const isOpen = job.status === "open";
  const isAssignedProvider = job.assignedProviderId === userId;
  const invite = await db.query.jobRequestInvites.findFirst({
    where: and(
      eq(jobRequestInvites.jobRequestId, id),
      eq(jobRequestInvites.providerId, provider.id),
      inArray(jobRequestInvites.status, ["pending", "accepted"]),
    ),
    columns: { id: true },
  });

  if (!isOpen && !invite && !isAssignedProvider) {
    return new NextResponse("Job is not visible to provider", { status: 403 });
  }

  if (job.status !== "open") {
    return new NextResponse("Quoting is closed for this job", { status: 409 });
  }

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
    where: and(eq(jobQuotes.jobRequestId, id), eq(jobQuotes.providerId, provider.id)),
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
      jobRequestId: id,
      providerId: provider.id,
      amountTotal,
      availability: body?.availability?.trim() || null,
      included: body?.included?.trim() || null,
      excluded: body?.excluded?.trim() || null,
      responseSpeedHours: Math.max(1, Math.trunc(Number(body?.responseSpeedHours ?? 24))),
      status: "submitted",
      updatedAt: new Date(),
    })
    .returning();

  return NextResponse.json(created);
}
