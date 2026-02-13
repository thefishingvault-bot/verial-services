import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { jobPayments, jobQuotes, jobRequests, providers } from "@/db/schema";
import { calculateChargeBreakdown, sumCollectedPlatformFees } from "@/lib/job-requests";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const { jobId } = await params;

  const job = await db.query.jobRequests.findFirst({
    where: and(eq(jobRequests.id, jobId), eq(jobRequests.customerUserId, userId)),
    columns: {
      id: true,
      status: true,
      paymentStatus: true,
      acceptedQuoteId: true,
      totalPrice: true,
      remainingAmount: true,
    },
  });

  if (!job) return new NextResponse("Job not found", { status: 404 });
  if (!job.acceptedQuoteId) return new NextResponse("No accepted quote", { status: 400 });
  if (!job.remainingAmount || job.remainingAmount <= 0) return new NextResponse("No remaining balance", { status: 400 });
  if (job.paymentStatus !== "deposit_paid") return new NextResponse("Deposit must be paid first", { status: 400 });

  const quote = await db.query.jobQuotes.findFirst({
    where: and(eq(jobQuotes.id, job.acceptedQuoteId), eq(jobQuotes.jobRequestId, jobId)),
    columns: { id: true, providerId: true, amountTotal: true },
  });

  if (!quote) return new NextResponse("Accepted quote not found", { status: 404 });

  const provider = await db.query.providers.findFirst({
    where: eq(providers.id, quote.providerId),
    columns: { id: true, userId: true, stripeConnectId: true, plan: true },
  });

  if (!provider?.stripeConnectId) return new NextResponse("Provider Stripe account missing", { status: 400 });

  const existingPending = await db.query.jobPayments.findFirst({
    where: and(
      eq(jobPayments.jobRequestId, jobId),
      eq(jobPayments.quoteId, quote.id),
      eq(jobPayments.paymentType, "remainder"),
      inArray(jobPayments.paymentStatus, ["pending", "fully_paid"]),
    ),
    columns: { stripePaymentIntentId: true, paymentStatus: true },
  });

  if (existingPending?.paymentStatus === "pending") {
    const pi = await stripe.paymentIntents.retrieve(existingPending.stripePaymentIntentId);
    return NextResponse.json({
      paymentIntentId: pi.id,
      clientSecret: pi.client_secret,
      reused: true,
      amount: pi.amount,
    });
  }

  if (existingPending?.paymentStatus === "fully_paid") {
    return new NextResponse("Remaining balance already paid", { status: 409 });
  }

  const priorPlatformFeeCollected = await sumCollectedPlatformFees(jobId);
  const split = calculateChargeBreakdown({
    totalPrice: job.totalPrice ?? quote.amountTotal,
    providerPlan: provider.plan,
    paymentType: "remainder",
    priorPlatformFeeCollected,
  });

  if (split.amountTotal <= 0) return new NextResponse("No remaining amount to charge", { status: 400 });

  const paymentIntent = await stripe.paymentIntents.create({
    amount: split.amountTotal,
    currency: "nzd",
    automatic_payment_methods: { enabled: true },
    application_fee_amount: split.platformFeeAmount,
    transfer_data: { destination: provider.stripeConnectId },
    metadata: {
      job_request_id: jobId,
      quote_id: quote.id,
      payment_type: "remainder",
      customer_user_id: userId,
      provider_id: provider.id,
      provider_user_id: provider.userId,
      total_price: String(job.totalPrice ?? quote.amountTotal),
      platform_fee_amount: String(split.platformFeeAmount),
      provider_amount: String(split.providerAmount),
    },
  });

  await db.insert(jobPayments).values({
    jobRequestId: jobId,
    quoteId: quote.id,
    stripePaymentIntentId: paymentIntent.id,
    paymentType: "remainder",
    amountTotal: split.amountTotal,
    platformFeeAmount: split.platformFeeAmount,
    providerAmount: split.providerAmount,
    paymentStatus: "pending",
    createdAt: new Date(),
  });

  return NextResponse.json({
    paymentIntentId: paymentIntent.id,
    clientSecret: paymentIntent.client_secret,
    amount: split.amountTotal,
    platformFeeAmount: split.platformFeeAmount,
    providerAmount: split.providerAmount,
    reused: false,
  });
}
