import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { jobRequests, providers } from "@/db/schema";
import { assertJobTransition, isFullPaymentModeEnabled } from "@/lib/job-requests";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const provider = await db.query.providers.findFirst({
    where: eq(providers.userId, userId),
    columns: { id: true, userId: true },
  });
  if (!provider) return new NextResponse("Provider account required", { status: 403 });

  const { jobId } = await params;
  const body = (await req.json().catch(() => null)) as { action?: "in_progress" | "completed" } | null;

  const action = body?.action;
  if (!action || (action !== "in_progress" && action !== "completed")) {
    return new NextResponse("Invalid lifecycle action", { status: 400 });
  }

  const job = await db.query.jobRequests.findFirst({
    where: and(eq(jobRequests.id, jobId), eq(jobRequests.assignedProviderId, userId)),
    columns: { id: true, status: true, paymentStatus: true },
  });

  if (!job) return new NextResponse("Job not found", { status: 404 });

  try {
    if (action === "in_progress") {
      assertJobTransition(job.status, "in_progress");
      const [updated] = await db
        .update(jobRequests)
        .set({
          status: "in_progress",
          lifecycleUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(jobRequests.id, jobId))
        .returning({ id: jobRequests.id, status: jobRequests.status, paymentStatus: jobRequests.paymentStatus });

      return NextResponse.json(updated);
    }

    assertJobTransition(job.status, "completed");
    const fullPaymentMode = isFullPaymentModeEnabled();
    const closeNow = fullPaymentMode || job.paymentStatus === "fully_paid";

    const [updated] = await db
      .update(jobRequests)
      .set({
        status: closeNow ? "closed" : "completed",
        lifecycleUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(jobRequests.id, jobId))
      .returning({ id: jobRequests.id, status: jobRequests.status, paymentStatus: jobRequests.paymentStatus });

    return NextResponse.json(updated);
  } catch (error) {
    return new NextResponse(error instanceof Error ? error.message : "Invalid lifecycle transition", { status: 409 });
  }
}
