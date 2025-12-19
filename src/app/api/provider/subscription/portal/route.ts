import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
      columns: { stripeCustomerId: true },
    });

    if (!provider) return new NextResponse("Provider not found", { status: 404 });
    if (!provider.stripeCustomerId) {
      return NextResponse.json({ error: "No Stripe customer found for provider" }, { status: 400 });
    }

    const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "";
    const returnUrl = `${origin}/dashboard/provider/billing`;

    const session = await stripe.billingPortal.sessions.create({
      customer: provider.stripeCustomerId,
      return_url: returnUrl,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[API_PROVIDER_SUBSCRIPTION_PORTAL]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
