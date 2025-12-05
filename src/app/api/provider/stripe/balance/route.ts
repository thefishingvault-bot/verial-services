import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
    });

    if (!provider || !provider.stripeConnectId) {
      return new NextResponse("Provider not connected", { status: 404 });
    }

    const balance = await stripe.balance.retrieve({ stripeAccount: provider.stripeConnectId });

    return NextResponse.json({
      available: balance.available.reduce((acc, cur) => acc + cur.amount, 0),
      pending: balance.pending.reduce((acc, cur) => acc + cur.amount, 0),
      currency: balance.available[0]?.currency || "nzd",
    });
  } catch (error) {
    console.error("[API_PROVIDER_STRIPE_BALANCE]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
