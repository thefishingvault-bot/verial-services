import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { jobPayments, jobRequests } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const admin = await requireAdmin();
  if (!admin.isAdmin) return admin.response;

  const { jobId } = await params;
  const body = (await req.json().catch(() => null)) as { amount?: number; reason?: string } | null;

  const job = await db.query.jobRequests.findFirst({
    where: eq(jobRequests.id, jobId),
    columns: { id: true, paymentStatus: true, status: true },
  });
  if (!job) return new NextResponse("Job not found", { status: 404 });

  const paidPayment = await db.query.jobPayments.findFirst({
    where: and(
      eq(jobPayments.jobRequestId, jobId),
      inArray(jobPayments.paymentStatus, ["deposit_paid", "fully_paid"]),
    ),
    columns: {
      id: true,
      stripePaymentIntentId: true,
      amountTotal: true,
      paymentStatus: true,
    },
    orderBy: [desc(jobPayments.createdAt)],
  });

  if (!paidPayment) return new NextResponse("No refundable payment found", { status: 404 });

  const requestedAmount = Math.trunc(Number(body?.amount ?? paidPayment.amountTotal));
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    return new NextResponse("Invalid refund amount", { status: 400 });
  }

  const amount = Math.min(requestedAmount, paidPayment.amountTotal);
  await stripe.refunds.create({
    payment_intent: paidPayment.stripePaymentIntentId,
    amount,
    metadata: {
      job_request_id: jobId,
      admin_user_id: admin.userId,
      reason: body?.reason?.trim() || "admin_refund",
    },
  });

  const fullRefund = amount >= paidPayment.amountTotal;

  await db.transaction(async (tx) => {
    await tx
      .update(jobPayments)
      .set({
        paymentStatus: fullRefund ? "refunded" : "partially_refunded",
      })
      .where(eq(jobPayments.id, paidPayment.id));

    await tx
      .update(jobRequests)
      .set({
        paymentStatus: fullRefund ? "refunded" : "partially_refunded",
        status: fullRefund ? "cancelled" : job.status,
        lifecycleUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(jobRequests.id, jobId));
  });

  return NextResponse.json({
    id: jobId,
    refundedAmount: amount,
    paymentStatus: fullRefund ? "refunded" : "partially_refunded",
  });
}
