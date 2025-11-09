import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
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
      // Provider exists but hasn't started Stripe onboarding
      return NextResponse.json({
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        stripeConnectId: null,
      });
    }

    // Retrieve the full account details from Stripe
    const account = await stripe.accounts.retrieve(provider.stripeConnectId);

    return NextResponse.json({
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      stripeConnectId: account.id,
    });

  } catch (error) {
    console.error("[API_CONNECT_DETAILS]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

