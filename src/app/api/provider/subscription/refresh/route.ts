import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import Stripe from "stripe";

import { db } from "@/lib/db";
import { stripe, detectStripeMode } from "@/lib/stripe";
import { providers, users } from "@/db/schema";
import {
  normalizeProviderPlan,
  resolvePlanFromStripePrice,
  isStripeSubscribedStatus,
} from "@/lib/provider-subscription";
import { checkProvidersColumnsExist } from "@/lib/provider-subscription-schema";

export const runtime = "nodejs";

type ProviderPlan = "starter" | "pro" | "elite";

function getSubPeriodEndUnix(sub: Stripe.Subscription): number {
  // Stripe uses seconds since epoch.
  const anySub = sub as unknown as { current_period_end?: number | null };
  return typeof anySub.current_period_end === "number" ? anySub.current_period_end : 0;
}

function pickBestSubscription(subs: Stripe.Subscription[]): Stripe.Subscription | null {
  const subscribed = subs.filter((s) => isStripeSubscribedStatus(s.status));
  const byLatestEnd = (a: Stripe.Subscription, b: Stripe.Subscription) => getSubPeriodEndUnix(b) - getSubPeriodEndUnix(a);
  return (
    subscribed.sort(byLatestEnd)[0] ??
    subs.sort(byLatestEnd)[0] ??
    null
  );
}

function resolvePlanFromSubscription(sub: Stripe.Subscription): {
  plan: ProviderPlan | null;
  matchedPriceId: string | null;
} {
  // Prefer the highest plan across items.
  // Note: items may be expanded as Stripe.Price objects.
  const items = sub.items?.data ?? [];

  let bestPlan: ProviderPlan | null = null;
  let bestPriceId: string | null = null;

  for (const item of items) {
    const price = item.price;
    const priceId = price?.id ?? null;
    const lookupKey = (price as unknown as { lookup_key?: string | null })?.lookup_key ?? null;

    const plan = resolvePlanFromStripePrice({ priceId, priceLookupKey: lookupKey });
    if (!plan) continue;

    if (plan === "elite") {
      return { plan: "elite", matchedPriceId: priceId };
    }

    if (plan === "pro" && bestPlan !== "elite") {
      bestPlan = "pro";
      bestPriceId = priceId;
    }
  }

  return { plan: bestPlan, matchedPriceId: bestPriceId };
}

async function findStripeCustomerId(params: {
  providerId: string;
  existingCustomerId: string | null;
  existingSubscriptionId: string | null;
  email: string | null;
}): Promise<string | null> {
  const { providerId, existingCustomerId, existingSubscriptionId, email } = params;

  if (existingCustomerId) return existingCustomerId;

  if (existingSubscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(existingSubscriptionId);
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      return customerId ?? null;
    } catch (err) {
      console.warn("[API_PROVIDER_SUBSCRIPTION_REFRESH] Failed to retrieve subscription for customer lookup", {
        providerId,
        existingSubscriptionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!email) return null;

  // Best-effort: find customer by email and/or metadata.
  // Stripe Search API uses Lucene-like query syntax.
  try {
    const res = await stripe.customers.search({
      query: `email:'${email.replace(/'/g, "\\'")}'`,
      limit: 10,
    });

    const exactByMetadata = res.data.find((c) => (c.metadata as Record<string, string> | undefined)?.providerId === providerId);
    if (exactByMetadata) return exactByMetadata.id;

    return res.data[0]?.id ?? null;
  } catch (err) {
    console.warn("[API_PROVIDER_SUBSCRIPTION_REFRESH] Failed to search customers by email", {
      providerId,
      email,
      mode: detectStripeMode(),
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function POST() {
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
      "stripe_subscription_updated_at",
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
        stripeSubscriptionUpdatedAt: true,
      },
    });
    if (!provider) return new NextResponse("Provider not found", { status: 404 });

    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { email: true },
    });

    const customerId = await findStripeCustomerId({
      providerId: provider.id,
      existingCustomerId: provider.stripeCustomerId ?? null,
      existingSubscriptionId: provider.stripeSubscriptionId ?? null,
      email: dbUser?.email ?? null,
    });

    if (!customerId) {
      return NextResponse.json(
        {
          error: "Stripe customer not linked to provider",
          providerId: provider.id,
        },
        { status: 409 },
      );
    }

    const subsRes = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
      expand: ["data.items.data.price"],
    });

    const subs = subsRes.data ?? [];
    const best = pickBestSubscription(subs);

    const bestStatus = best?.status ?? null;
    const subscribed = isStripeSubscribedStatus(bestStatus);

    const resolved = best ? resolvePlanFromSubscription(best) : { plan: null, matchedPriceId: null };

    const finalPlan: ProviderPlan = subscribed ? (resolved.plan ?? "starter") : "starter";
    const priceId = resolved.matchedPriceId ?? best?.items?.data?.[0]?.price?.id ?? null;
    const currentPeriodEnd = best ? getSubPeriodEndUnix(best) : 0;

    await db
      .update(providers)
      .set({
        plan: finalPlan,
        stripeCustomerId: customerId,
        stripeSubscriptionId: best?.id ?? null,
        stripeSubscriptionStatus: bestStatus,
        stripeSubscriptionPriceId: priceId,
        stripeCurrentPeriodEnd: best && currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
        stripeCancelAtPeriodEnd: best?.cancel_at_period_end ?? false,
        stripeSubscriptionUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(providers.id, provider.id));

    console.info("[API_PROVIDER_SUBSCRIPTION_REFRESH] Synced", {
      providerId: provider.id,
      stripeCustomerId: customerId,
      stripeSubscriptionId: best?.id ?? null,
      status: bestStatus,
      subscribed,
      plan: finalPlan,
      priceId,
      currentPeriodEndUnix: currentPeriodEnd || null,
      mode: detectStripeMode(),
    });

    return NextResponse.json({
      providerId: provider.id,
      plan: normalizeProviderPlan(finalPlan),
      stripe: {
        customerId,
        subscriptionId: best?.id ?? null,
        status: bestStatus,
        priceId,
        currentPeriodEnd: best && currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
        cancelAtPeriodEnd: best?.cancel_at_period_end ?? false,
        lastSyncAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[API_PROVIDER_SUBSCRIPTION_REFRESH]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
