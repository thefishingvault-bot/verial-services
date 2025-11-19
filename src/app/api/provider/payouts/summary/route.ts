import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Find the provider record linked to this user
    const provider = await db.query.providers.findFirst({
      where: (p, { eq }) => eq(p.userId, userId),
    });

    if (!provider) {
      return new NextResponse("Provider not found. You must register as a provider first.", { status: 404 });
    }

    if (!provider.stripeConnectId) {
      return new NextResponse("Stripe Connect account not found. Please complete onboarding first.", { status: 400 });
    }

    // Fetch the balance for the connected account
    const balance = await stripe.balance.retrieve({
      stripeAccount: provider.stripeConnectId,
    });

    // Fetch recent payouts (transfers to bank)
    const payouts = await stripe.payouts.list(
      {
        limit: 10,
      },
      {
        stripeAccount: provider.stripeConnectId,
      }
    );

    // Calculate available and pending balances
    const availableBalance = balance.available.reduce((sum, bal) => sum + bal.amount, 0);
    const pendingBalance = balance.pending.reduce((sum, bal) => sum + bal.amount, 0);

    return NextResponse.json({
      availableBalance,
      pendingBalance,
      currency: balance.available[0]?.currency || 'nzd',
      payouts: payouts.data.map((payout) => ({
        id: payout.id,
        amount: payout.amount,
        currency: payout.currency,
        status: payout.status,
        arrivalDate: payout.arrival_date,
        created: payout.created,
        description: payout.description,
        method: payout.method,
      })),
    });

  } catch (error) {
    console.error("[API_PROVIDER_PAYOUTS_SUMMARY]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
