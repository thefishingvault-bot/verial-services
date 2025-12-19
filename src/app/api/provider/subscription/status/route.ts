import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { normalizeProviderPlan } from "@/lib/provider-subscription";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

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
        currentPeriodEnd: provider.stripeCurrentPeriodEnd?.toISOString?.() ?? (provider.stripeCurrentPeriodEnd as any) ?? null,
        cancelAtPeriodEnd: provider.stripeCancelAtPeriodEnd ?? false,
      },
    });
  } catch (error) {
    console.error("[API_PROVIDER_SUBSCRIPTION_STATUS]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
