import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { stripe } from "@/lib/stripe";
import { checkProvidersColumnsExist } from "@/lib/provider-subscription-schema";
import { assertProviderCanTransactFromProvider } from "@/lib/provider-access";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const schema = await checkProvidersColumnsExist(["stripe_customer_id"]);
    if (!schema.ok) {
      return NextResponse.json(
        {
          error: "Provider subscription schema missing in database. Apply the latest migrations.",
          code: "MIGRATION_REQUIRED",
          missingColumns: schema.missingColumns,
          expectedMigration: "0030_provider_subscriptions.sql",
        },
        { status: 503 },
      );
    }

    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
      columns: { stripeCustomerId: true, isSuspended: true, suspensionReason: true, suspensionStartDate: true, suspensionEndDate: true },
    });

    if (!provider) return new NextResponse("Provider not found", { status: 404 });

    const access = assertProviderCanTransactFromProvider(provider);
    if (!access.ok) return access.response;

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
