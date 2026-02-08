import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import Stripe from "stripe";

import { db } from "@/lib/db";
import { stripe, detectStripeMode } from "@/lib/stripe";
import { providers, users } from "@/db/schema";
import {
  normalizeProviderPlan,
  resolvePlanFromStripeDetails,
  getExpectedStripePriceIds,
  type ProviderPlan,
} from "@/lib/provider-subscription";
import { checkProvidersColumnsExist } from "@/lib/provider-subscription-schema";
import { assertProviderCanTransactFromProvider } from "@/lib/provider-access";

export const runtime = "nodejs";

function maskStripeId(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 12) return `${value.slice(0, 6)}…`;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function maskEmail(value: string | null): string | null {
  if (!value) return null;
  const at = value.indexOf("@");
  if (at <= 0) return null;
  const name = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!domain) return null;
  const visible = name.slice(0, 2);
  return `${visible}${name.length > 2 ? "…" : ""}@${domain}`;
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
  resolutionSource: "lookup_key" | "env_price_id" | "env_product_id" | "product_name" | "none";
  matched: boolean;
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

  const resolution = resolvePlanFromStripeDetails({
    mode,
    priceId,
    lookupKey,
    productId,
    productName,
  });

  return {
    plan: resolution.plan,
    matchedPriceId: priceId,
    matchedLookupKey: lookupKey,
    matchedProductId: productId,
    matchedProductName: productName,
    itemPriceIds,
    itemLookupKeys,
    resolutionSource: resolution.source,
    matched: resolution.matched,
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

async function listSubscriptionsForCustomer(customerId: string): Promise<Stripe.Subscription[]> {
  const subsRes = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
    // NOTE: Avoid deep expands (Stripe enforces a max expansion depth).
    // Only expand price; fetch product details via a separate call if needed.
    expand: ["data.items.data.price"],
  });

  return subsRes.data ?? [];
}

async function pickBestCustomerByEmail(params: {
  providerId: string;
  email: string;
}): Promise<{
  customerId: string;
  best: Stripe.Subscription;
  resolved: Awaited<ReturnType<typeof resolvePlanFromSubscription>>;
} | null> {
  const { providerId, email } = params;

  try {
    const res = await stripe.customers.search({
      query: `email:'${email.replace(/'/g, "\\'")}'`,
      limit: 10,
    });

    // Prefer customers explicitly tagged for this provider.
    const prioritized = [...res.data].sort((a, b) => {
      const aTagged = (a.metadata as Record<string, string> | undefined)?.providerId === providerId;
      const bTagged = (b.metadata as Record<string, string> | undefined)?.providerId === providerId;
      return Number(bTagged) - Number(aTagged);
    });

    let bestCandidate: { customerId: string; best: Stripe.Subscription; resolved: Awaited<ReturnType<typeof resolvePlanFromSubscription>> } | null = null;

    for (const customer of prioritized) {
      const subs = await listSubscriptionsForCustomer(customer.id);
      const best = pickBestSubscription(subs);
      if (!best) continue;

      const subscribed = best.status === "active" || best.status === "trialing";
      if (!subscribed) continue;

      const resolved = await resolvePlanFromSubscription(best);

      // Pick the best active/trialing subscription by latest period end.
      if (!bestCandidate) {
        bestCandidate = { customerId: customer.id, best, resolved };
        continue;
      }

      const aEnd = getSubPeriodEndUnix(bestCandidate.best);
      const bEnd = getSubPeriodEndUnix(best);
      if (bEnd > aEnd) bestCandidate = { customerId: customer.id, best, resolved };
    }

    return bestCandidate;
  } catch (err) {
    console.warn("[API_PROVIDER_SUBSCRIPTION_REFRESH] Failed to search customers for fallback relink", {
      providerId,
      email: maskEmail(email),
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
        isSuspended: true,
        suspensionReason: true,
        suspensionStartDate: true,
        suspensionEndDate: true,
      },
    });
    if (!provider) return new NextResponse("Provider not found", { status: 404 });

    const access = assertProviderCanTransactFromProvider(provider);
    if (!access.ok) return access.response;

    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { email: true },
    });

    // Environment sanity: show what Stripe account + mode this deployment is using.
    try {
      const acct = await stripe.accounts.retrieve();
      console.info("[API_PROVIDER_SUBSCRIPTION_REFRESH] Stripe env", {
        providerId: provider.id,
        userId,
        mode: detectStripeMode(),
        stripeAccountId: acct?.id ?? null,
        stripeAccountLivemode: (acct as unknown as { livemode?: boolean | null })?.livemode ?? null,
      });
    } catch (err) {
      console.warn("[API_PROVIDER_SUBSCRIPTION_REFRESH] Failed to retrieve Stripe account", {
        providerId: provider.id,
        userId,
        mode: detectStripeMode(),
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const customerId = await findStripeCustomerId({
      providerId: provider.id,
      existingCustomerId: provider.stripeCustomerId ?? null,
      existingSubscriptionId: provider.stripeSubscriptionId ?? null,
      email: dbUser?.email ?? null,
    });

    console.info("[API_PROVIDER_SUBSCRIPTION_REFRESH] Starting", {
      providerId: provider.id,
      userId,
      mode: detectStripeMode(),
      existingStripeCustomerId: provider.stripeCustomerId ?? null,
      existingStripeSubscriptionId: provider.stripeSubscriptionId ?? null,
      email: maskEmail(dbUser?.email ?? null),
      resolvedCustomerId: customerId,
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

    let effectiveCustomerId = customerId;
    let subs = await listSubscriptionsForCustomer(effectiveCustomerId);
    let best = pickBestSubscription(subs);

    // Fallback relink: If we have a linked customer but it has no active/trialing subs,
    // try to find the right customer by email (common when subscriptions are created manually
    // or when a provider ends up with multiple Stripe customers).
    if ((best?.status !== "active" && best?.status !== "trialing") && dbUser?.email) {
      const fallback = await pickBestCustomerByEmail({ providerId: provider.id, email: dbUser.email });
      if (fallback && fallback.customerId !== effectiveCustomerId) {
        console.warn("[API_PROVIDER_SUBSCRIPTION_REFRESH] Relinking Stripe customer based on email", {
          providerId: provider.id,
          userId,
          mode: detectStripeMode(),
          fromCustomerId: effectiveCustomerId,
          toCustomerId: fallback.customerId,
        });
        effectiveCustomerId = fallback.customerId;
        subs = await listSubscriptionsForCustomer(effectiveCustomerId);
        best = pickBestSubscription(subs);
      }
    }

    const bestStatus = best?.status ?? null;
    const subscribed = bestStatus === "active" || bestStatus === "trialing";

    const resolved = best ? await resolvePlanFromSubscription(best) : null;

    // Never silently store starter when subscribed unless it truly maps to starter (via env product id).
    const finalPlan: ProviderPlan = subscribed ? (resolved?.plan ?? "unknown") : "starter";
    const priceId = resolved?.matchedPriceId ?? best?.items?.data?.[0]?.price?.id ?? null;
    const lookupKey = resolved?.matchedLookupKey ?? null;
    const productId = resolved?.matchedProductId ?? null;
    const productName = resolved?.matchedProductName ?? null;
    const currentPeriodEnd = best ? getSubPeriodEndUnix(best) : 0;

    // Best-effort: attach metadata to the Stripe customer so webhooks can map in the future.
    // (Safe even if the customer already has metadata; Stripe merges keys.)
    try {
      await stripe.customers.update(effectiveCustomerId, {
        metadata: {
          providerId: provider.id,
          userId,
        },
      });
    } catch (err) {
      console.warn("[API_PROVIDER_SUBSCRIPTION_REFRESH] Failed to update Stripe customer metadata", {
        providerId: provider.id,
        userId,
        stripeCustomerId: effectiveCustomerId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await db
      .update(providers)
      .set({
        plan: finalPlan,
        stripeCustomerId: effectiveCustomerId,
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
      userId,
      stripeCustomerId: effectiveCustomerId,
      stripeSubscriptionId: best?.id ?? null,
      status: bestStatus,
      subscribed,
      plan: finalPlan,
      priceId,
      lookupKey,
      productId,
      productName,
      subscriptionLivemode: (best as unknown as { livemode?: boolean | null })?.livemode ?? null,
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
        mode: detectStripeMode(),
        customerId: effectiveCustomerId,
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
        matched: resolved?.matched ?? false,
        subscriptionLivemode: (best as unknown as { livemode?: boolean | null })?.livemode ?? null,
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
