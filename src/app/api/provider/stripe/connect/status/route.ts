import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const provider = await db.query.providers.findFirst({
    where: eq(providers.userId, userId),
    columns: {
      id: true,
      userId: true,
      stripeConnectId: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      verificationStatus: true,
    },
  });

  if (!provider) {
    return new NextResponse("Provider not found", { status: 404 });
  }

  if (!provider.stripeConnectId) {
    console.info("[STRIPE_CONNECT_STATUS_SYNC] No connect account", {
      providerId: provider.id,
    });

    return NextResponse.json({
      providerId: provider.id,
      stripeConnectId: null,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      currentlyDueCount: null as number | null,
      verificationStatus: provider.verificationStatus,
      verificationRequiredBeforePayout: provider.verificationStatus !== "verified",
    });
  }

  const account = await stripe.accounts.retrieve(provider.stripeConnectId);
  const chargesEnabled = !!account.charges_enabled;
  const payoutsEnabled = !!account.payouts_enabled;
  const effectivePayoutsEnabled = payoutsEnabled && provider.verificationStatus === "verified";
  const detailsSubmitted = !!account.details_submitted;
  const currentlyDueCount = Array.isArray(account.requirements?.currently_due)
    ? account.requirements.currently_due.length
    : null;

  await db
    .update(providers)
    .set({
      chargesEnabled,
      payoutsEnabled: effectivePayoutsEnabled,
      updatedAt: new Date(),
    })
    .where(eq(providers.id, provider.id));

  console.info("[STRIPE_CONNECT_STATUS_SYNC] Synced", {
    providerId: provider.id,
    stripeConnectId: provider.stripeConnectId,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    currentlyDueCount,
  });

  return NextResponse.json({
    providerId: provider.id,
    stripeConnectId: provider.stripeConnectId,
    chargesEnabled,
    payoutsEnabled: effectivePayoutsEnabled,
    detailsSubmitted,
    currentlyDueCount,
    verificationStatus: provider.verificationStatus,
    verificationRequiredBeforePayout: provider.verificationStatus !== "verified",
  });
}
