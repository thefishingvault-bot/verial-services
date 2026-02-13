import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { jobPayments, jobQuotes, jobRequests, providers } from "@/db/schema";
import { calculateChargeBreakdown, isFullPaymentModeEnabled } from "@/lib/job-requests";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const { jobId } = await params;
  const body = (await req.json().catch(() => null)) as { quoteId?: string } | null;
  const quoteId = body?.quoteId?.trim();

  if (!jobId || !quoteId) return new NextResponse("Missing jobId or quoteId", { status: 400 });

  const job = await db.query.jobRequests.findFirst({
    where: and(eq(jobRequests.id, jobId), eq(jobRequests.customerUserId, userId)),
    columns: {
      id: true,
      status: true,
      acceptedQuoteId: true,
      paymentStatus: true,
    },
  });

  if (!job) return new NextResponse("Job not found", { status: 404 });
  if (job.status !== "open") return new NextResponse("Job is not open", { status: 400 });
  if (job.acceptedQuoteId && job.acceptedQuoteId !== quoteId) {
    return new NextResponse("A quote has already been accepted", { status: 409 });
  }

  const quote = await db.query.jobQuotes.findFirst({
    where: and(eq(jobQuotes.id, quoteId), eq(jobQuotes.jobRequestId, jobId), eq(jobQuotes.status, "submitted")),
    columns: { id: true, amountTotal: true, providerId: true },
  });

  if (!quote) return new NextResponse("Quote not found", { status: 404 });

  const provider = await db.query.providers.findFirst({
    where: eq(providers.id, quote.providerId),
    columns: { id: true, userId: true, stripeConnectId: true, plan: true },
  });

  if (!provider) return new NextResponse("Provider not found", { status: 404 });
  if (!provider.stripeConnectId || !provider.stripeConnectId.startsWith("acct_")) {
    return new NextResponse("Provider is not connected to Stripe", { status: 400 });
  }

  const fullPaymentMode = isFullPaymentModeEnabled();
  const paymentType = fullPaymentMode ? "full" : "deposit";

  const existingPayment = await db.query.jobPayments.findFirst({
    where: and(
      eq(jobPayments.jobRequestId, jobId),
      eq(jobPayments.quoteId, quoteId),
      eq(jobPayments.paymentType, paymentType),
      inArray(jobPayments.paymentStatus, ["pending", "deposit_paid", "fully_paid"]),
    ),
    columns: { id: true, stripePaymentIntentId: true, paymentStatus: true },
  });

  if (existingPayment?.paymentStatus === "pending") {
    const existingPi = await stripe.paymentIntents.retrieve(existingPayment.stripePaymentIntentId);
    return NextResponse.json({
      paymentIntentId: existingPi.id,
      clientSecret: existingPi.client_secret,
      paymentType,
      amount: existingPi.amount,
      reused: true,
    });
  }

  if (existingPayment?.paymentStatus === "deposit_paid" || existingPayment?.paymentStatus === "fully_paid") {
    return new NextResponse("Quote payment already captured", { status: 409 });
  }

  const split = calculateChargeBreakdown({
    totalPrice: quote.amountTotal,
    providerPlan: provider.plan,
    paymentType,
  });

  const paymentIntent = await stripe.paymentIntents.create({
    amount: split.amountTotal,
    currency: "nzd",
    automatic_payment_methods: { enabled: true },
    application_fee_amount: split.platformFeeAmount,
    transfer_data: { destination: provider.stripeConnectId },
    metadata: {
      job_request_id: jobId,
      quote_id: quoteId,
      payment_type: paymentType,
      customer_user_id: userId,
      provider_id: provider.id,
      provider_user_id: provider.userId,
      total_price: String(quote.amountTotal),
      platform_fee_amount: String(split.platformFeeAmount),
      provider_amount: String(split.providerAmount),
    },
  });

  await db.transaction(async (tx) => {
    await tx
      .update(jobRequests)
      .set({
        acceptedQuoteId: quoteId,
        totalPrice: quote.amountTotal,
        depositAmount: fullPaymentMode ? quote.amountTotal : split.amountTotal,
        remainingAmount: fullPaymentMode ? 0 : Math.max(0, quote.amountTotal - split.amountTotal),
        paymentStatus: "pending",
        lifecycleUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(jobRequests.id, jobId));

    await tx.insert(jobPayments).values({
      jobRequestId: jobId,
      quoteId,
      stripePaymentIntentId: paymentIntent.id,
      paymentType,
      amountTotal: split.amountTotal,
      platformFeeAmount: split.platformFeeAmount,
      providerAmount: split.providerAmount,
      paymentStatus: "pending",
      createdAt: new Date(),
    });
  });

  return NextResponse.json({
    paymentIntentId: paymentIntent.id,
    clientSecret: paymentIntent.client_secret,
    paymentType,
    amount: split.amountTotal,
    platformFeeAmount: split.platformFeeAmount,
    providerAmount: split.providerAmount,
    fullPaymentMode,
  });
}
