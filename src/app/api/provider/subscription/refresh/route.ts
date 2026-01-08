import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import Stripe from "stripe";

import { db } from "@/lib/db";
import { stripe, detectStripeMode } from "@/lib/stripe";
import { providers, users } from "@/db/schema";
import {
  normalizeProviderPlan,
  getExpectedStripePriceIds,
  type ProviderPlan,
} from "@/lib/provider-subscription";
import { checkProvidersColumnsExist } from "@/lib/provider-subscription-schema";

export const runtime = "nodejs";

function maskStripeId(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 12) return `${value.slice(0, 6)}…`;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function getSubPeriodEndUnix(sub: Stripe.Subscription): number {
  // Stripe uses seconds since epoch.
  const anySub = sub as unknown as { current_period_end?: number | null };
  return typeof anySub.current_period_end === "number" ? anySub.current_period_end : 0;
}

function pickBestSubscription(subs: Stripe.Subscription[]): Stripe.Subscription | null {
  // Per spec, treat only active/trialing as "subscribed".
  const subscribed = subs.filter((s) => s.status === "active" || s.status === "trialing");
  const byLatestEnd = (a: Stripe.Subscription, b: Stripe.Subscription) => getSubPeriodEndUnix(b) - getSubPeriodEndUnix(a);
  return (
    subscribed.sort(byLatestEnd)[0] ??
    subs.sort(byLatestEnd)[0] ??
    null
  );
}

async function resolvePlanFromSubscription(sub: Stripe.Subscription): Promise<{
  plan: ProviderPlan;
  matchedPriceId: string | null;
  matchedLookupKey: string | null;
  matchedProductId: string | null;
  matchedProductName: string | null;
  itemPriceIds: string[];
  itemLookupKeys: Array<string | null>;
  resolutionSource: "lookup_key" | "env_price_id" | "product_name" | "none";
  expected: ReturnType<typeof getExpectedStripePriceIds>;
}> {
  const items = sub.items?.data ?? [];
  const mode = detectStripeMode();
  const expected = getExpectedStripePriceIds({ mode });

  const itemPriceIds = items.map((it) => it.price?.id).filter((v): v is string => typeof v === "string");
  const itemLookupKeys = items.map(
    (it) => ((it.price as unknown as { lookup_key?: string | null })?.lookup_key ?? null) as string | null,
  );

  // Per spec: use the FIRST subscription item.
  const item = items[0] ?? null;
  const priceId = item?.price?.id ?? null;
  const lookupKey = (item?.price as unknown as { lookup_key?: string | null } | null)?.lookup_key ?? null;

  const rawProduct = (item?.price as unknown as { product?: unknown } | null)?.product ?? null;
  const productId =
    typeof rawProduct === "string"
      ? rawProduct
      : rawProduct && typeof rawProduct === "object" && "id" in rawProduct && typeof (rawProduct as { id?: unknown }).id === "string"
        ? (rawProduct as { id: string }).id
        : null;

  // Fetch product name via a second call (NOT via deep expand).
  let productName: string | null = null;
  if (productId) {
    try {
      const product = await stripe.products.retrieve(productId);
      productName = product?.name ?? null;
    } catch {
      productName = null;
    }
  }

  // Mapping priority (do NOT default to starter when active/trialing):
  // lookup_key → env price id → (handled by caller: unknown if active/trialing, starter otherwise)
  const proKey = process.env.STRIPE_LOOKUP_KEY_PRO_MONTHLY ?? "verial_pro_monthly";
  const eliteKey = process.env.STRIPE_LOOKUP_KEY_ELITE_MONTHLY ?? "verial_elite_monthly";

  let plan: ProviderPlan = "unknown";
  let resolutionSource: "lookup_key" | "env_price_id" | "product_name" | "none" = "none";

  if (lookupKey && lookupKey === proKey) {
    plan = "pro";
    resolutionSource = "lookup_key";
  } else if (lookupKey && lookupKey === eliteKey) {
    plan = "elite";
    resolutionSource = "lookup_key";
  } else if (priceId && expected.pro && priceId === expected.pro) {
    plan = "pro";
    resolutionSource = "env_price_id";
  } else if (priceId && expected.elite && priceId === expected.elite) {
    plan = "elite";
    resolutionSource = "env_price_id";
  }

  return {
    plan,
    matchedPriceId: priceId,
    matchedLookupKey: lookupKey,
    matchedProductId: productId,
    matchedProductName: productName,
    itemPriceIds,
    itemLookupKeys,
    resolutionSource,
    expected,
  };
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
      // NOTE: Avoid deep expands (Stripe enforces a max expansion depth).
      // Only expand price; fetch product details via a separate call if needed.
      expand: ["data.items.data.price"],
    });

    const subs = subsRes.data ?? [];
    const best = pickBestSubscription(subs);

    const bestStatus = best?.status ?? null;
    const subscribed = bestStatus === "active" || bestStatus === "trialing";

    const resolved = best ? await resolvePlanFromSubscription(best) : null;

    const finalPlan: ProviderPlan = subscribed
      ? (resolved?.plan === "pro" || resolved?.plan === "elite" ? resolved.plan : "unknown")
      : "starter";
    const priceId = resolved?.matchedPriceId ?? best?.items?.data?.[0]?.price?.id ?? null;
    const lookupKey = resolved?.matchedLookupKey ?? null;
    const productId = resolved?.matchedProductId ?? null;
    const productName = resolved?.matchedProductName ?? null;
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
      lookupKey,
      productId,
      productName,
      resolutionSource: resolved?.resolutionSource ?? null,
      expectedProPriceIdMasked: maskStripeId(resolved?.expected.pro ?? null),
      expectedElitePriceIdMasked: maskStripeId(resolved?.expected.elite ?? null),
      subscriptionItemPriceIds: resolved?.itemPriceIds ?? [],
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
        subscription_price_id: priceId,
        subscription_lookup_key: lookupKey,
        subscription_product_id: productId,
        subscription_product_name: productName,
        subscription_item_price_ids: resolved?.itemPriceIds ?? [],
        subscription_item_lookup_keys: resolved?.itemLookupKeys ?? [],
        priceResolutionSource: resolved?.resolutionSource ?? null,
        mapping_source: resolved?.resolutionSource ?? null,
        expectedProPriceIdMasked: maskStripeId(resolved?.expected.pro ?? null),
        expectedElitePriceIdMasked: maskStripeId(resolved?.expected.elite ?? null),
        expectedEnvSource: resolved?.expected.source ?? null,
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
