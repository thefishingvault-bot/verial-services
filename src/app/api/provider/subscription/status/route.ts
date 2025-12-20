import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { normalizeProviderPlan } from "@/lib/provider-subscription";
import { checkProvidersColumnsExist } from "@/lib/provider-subscription-schema";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const schema = await checkProvidersColumnsExist([
      "plan",
      "stripe_customer_id",
      "stripe_subscription_id",
      "stripe_subscription_status",
      "stripe_subscription_price_id",
      "stripe_current_period_end",
      "stripe_cancel_at_period_end",
    ]);
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
      columns: {
        id: true,
        plan: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        stripeSubscriptionStatus: true,
        stripeSubscriptionPriceId: true,
        stripeCurrentPeriodEnd: true,
        stripeCancelAtPeriodEnd: true,
      },
    });

    if (!provider) return new NextResponse("Provider not found", { status: 404 });

    return NextResponse.json({
      providerId: provider.id,
      plan: normalizeProviderPlan(provider.plan),
      stripe: {
        customerId: provider.stripeCustomerId ?? null,
        subscriptionId: provider.stripeSubscriptionId ?? null,
        status: provider.stripeSubscriptionStatus ?? null,
        priceId: provider.stripeSubscriptionPriceId ?? null,
        currentPeriodEnd:
          provider.stripeCurrentPeriodEnd instanceof Date
            ? provider.stripeCurrentPeriodEnd.toISOString()
            : provider.stripeCurrentPeriodEnd
              ? String(provider.stripeCurrentPeriodEnd)
              : null,
        cancelAtPeriodEnd: provider.stripeCancelAtPeriodEnd ?? false,
      },
    });
  } catch (error) {
    console.error("[API_PROVIDER_SUBSCRIPTION_STATUS]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
