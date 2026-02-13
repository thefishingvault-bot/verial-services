import { auth } from "@clerk/nextjs/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { jobPayments, jobRequests, providers } from "@/db/schema";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const { jobId } = await params;
  const body = (await req.json().catch(() => null)) as { reason?: string } | null;

  const provider = await db.query.providers.findFirst({
    where: eq(providers.userId, userId),
    columns: { id: true, userId: true },
  });

  const job = await db.query.jobRequests.findFirst({
    where: eq(jobRequests.id, jobId),
    columns: {
      id: true,
      customerUserId: true,
      assignedProviderId: true,
      status: true,
      paymentStatus: true,
    },
  });

  if (!job) return new NextResponse("Job not found", { status: 404 });

  const isCustomer = job.customerUserId === userId;
  const isAssignedProvider = provider?.userId && job.assignedProviderId === provider.userId;
  if (!isCustomer && !isAssignedProvider) return new NextResponse("Forbidden", { status: 403 });

  if (job.status === "cancelled" || job.status === "closed") {
    return new NextResponse("Job is already finalized", { status: 400 });
  }

  if (job.status === "in_progress") {
    return new NextResponse("Cancellation requires admin review for in-progress jobs", { status: 409 });
  }

  if (job.status === "open") {
    const [updated] = await db
      .update(jobRequests)
      .set({
        status: "cancelled",
        lifecycleUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(jobRequests.id, jobId))
      .returning({ id: jobRequests.id, status: jobRequests.status, paymentStatus: jobRequests.paymentStatus });

    return NextResponse.json({ ...updated, reason: body?.reason ?? null, refunded: false });
  }

  const refundablePayment = await db.query.jobPayments.findFirst({
    where: and(
      eq(jobPayments.jobRequestId, jobId),
      inArray(jobPayments.paymentType, ["deposit", "full"]),
      inArray(jobPayments.paymentStatus, ["deposit_paid", "fully_paid"]),
    ),
    orderBy: [desc(jobPayments.createdAt)],
    columns: {
      id: true,
      stripePaymentIntentId: true,
      amountTotal: true,
      paymentStatus: true,
      paymentType: true,
    },
  });

  if (!refundablePayment) {
    const [updated] = await db
      .update(jobRequests)
      .set({
        status: "cancelled",
        lifecycleUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(jobRequests.id, jobId))
      .returning({ id: jobRequests.id, status: jobRequests.status, paymentStatus: jobRequests.paymentStatus });

    return NextResponse.json({ ...updated, refunded: false, reason: body?.reason ?? null });
  }

  await stripe.refunds.create({
    payment_intent: refundablePayment.stripePaymentIntentId,
    amount: refundablePayment.amountTotal,
    metadata: {
      job_request_id: jobId,
      reason: body?.reason?.trim() || "job_cancelled",
      actor: isCustomer ? "customer" : "provider",
    },
  });

  await db.transaction(async (tx) => {
    await tx
      .update(jobPayments)
      .set({ paymentStatus: "refunded" })
      .where(eq(jobPayments.id, refundablePayment.id));

    await tx
      .update(jobRequests)
      .set({
        status: "cancelled",
        paymentStatus: "refunded",
        lifecycleUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(jobRequests.id, jobId));
  });

  return NextResponse.json({
    id: jobId,
    status: "cancelled",
    paymentStatus: "refunded",
    refunded: true,
    reason: body?.reason ?? null,
  });
}
