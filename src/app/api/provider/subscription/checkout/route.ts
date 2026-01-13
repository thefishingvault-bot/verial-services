import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { providers, users } from "@/db/schema";
import {
  getStripeLookupKeyForPlan,
  getStripePriceIdForPlan,
  getStripeProductIdForPlan,
  normalizeProviderPlan,
} from "@/lib/provider-subscription";
import { checkProvidersColumnsExist } from "@/lib/provider-subscription-schema";
import {
  detectStripeMode,
  resolveActiveMonthlyPriceIdByLookupKey,
  resolveActiveMonthlyPriceIdByProduct,
  retrieveStripePriceSafe,
  validateSubscriptionMonthlyPrice,
  type StripeMode,
} from "@/lib/stripe";
import { assertProviderCanTransactFromProvider } from "@/lib/provider-access";

export const runtime = "nodejs";

const BodySchema = z.object({
  plan: z.enum(["pro", "elite"]),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const schema = await checkProvidersColumnsExist([
      "stripe_customer_id",
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

    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
    }

    const plan = normalizeProviderPlan(parsed.data.plan);
    const mode: StripeMode = detectStripeMode();

    const lookupKey = getStripeLookupKeyForPlan(plan);
    const productId = getStripeProductIdForPlan(plan);

    const envPriceId = getStripePriceIdForPlan(plan);
    // IMPORTANT: envPriceId may come from multiple env vars (MONTHLY + legacy). We'll validate any candidates.
    const envCandidatesRaw = [
      process.env.STRIPE_PRICE_PRO_MONTHLY,
      process.env.STRIPE_PRICE_PRO,
      process.env.STRIPE_PRICE_ELITE_MONTHLY,
      process.env.STRIPE_PRICE_ELITE,
    ];

    const envCandidates = Array.from(
      new Set(
        envCandidatesRaw
          .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
          .map((v) => v.trim()),
      ),
    );

    type Attempt = {
      source: "env" | "lookup_key" | "product";
      input: string | null;
      resolvedPriceId: string | null;
      ok: boolean;
      reason?: string;
      active?: boolean | null;
      livemode?: boolean | null;
      type?: string | null;
      recurringInterval?: string | null;
    };

    const attempts: Attempt[] = [];
    let priceId: string | null = null;
    let priceSource: "env" | "lookup_key" | "product" | "none" = "none";

    // 1) Try env price IDs (validate each; skip inactive/wrong type/mode).
    // Note: we still compute envPriceId via helper for backward compat, but we also iterate candidates to avoid a single bad value taking precedence.
    const envToTry = Array.from(new Set([...(envPriceId ? [envPriceId] : []), ...envCandidates]));
    for (const candidate of envToTry) {
      if (!candidate.startsWith("price_")) {
        attempts.push({ source: "env", input: candidate, resolvedPriceId: null, ok: false, reason: "not_price_id" });
        continue;
      }

      const retrieved = await retrieveStripePriceSafe(candidate);
      if (!retrieved) {
        attempts.push({ source: "env", input: candidate, resolvedPriceId: candidate, ok: false, reason: "not_found" });
        continue;
      }

      const validation = validateSubscriptionMonthlyPrice({ price: retrieved, mode });
      if (!validation.ok) {
        attempts.push({
          source: "env",
          input: candidate,
          resolvedPriceId: candidate,
          ok: false,
          reason: validation.reason,
          active: retrieved.active ?? null,
          livemode: retrieved.livemode ?? null,
          type: retrieved.type ?? null,
          recurringInterval: retrieved.recurring?.interval ?? null,
        });
        continue;
      }

      priceId = candidate;
      priceSource = "env";
      attempts.push({
        source: "env",
        input: candidate,
        resolvedPriceId: candidate,
        ok: true,
        active: retrieved.active ?? null,
        livemode: retrieved.livemode ?? null,
        type: retrieved.type ?? null,
        recurringInterval: retrieved.recurring?.interval ?? null,
      });
      break;
    }

    // 2) Fallback: lookup_key (active only, monthly recurring only).
    if (!priceId && lookupKey) {
      const resolved = await resolveActiveMonthlyPriceIdByLookupKey(lookupKey, mode);
      if (resolved) {
        priceId = resolved;
        priceSource = "lookup_key";
        attempts.push({ source: "lookup_key", input: lookupKey, resolvedPriceId: resolved, ok: true });
      } else {
        attempts.push({ source: "lookup_key", input: lookupKey, resolvedPriceId: null, ok: false, reason: "no_active_monthly_price" });
      }
    }

    // 3) Fallback: product id (active monthly recurring price under that product).
    if (!priceId && productId) {
      if (!productId.startsWith("prod_")) {
        attempts.push({ source: "product", input: productId, resolvedPriceId: null, ok: false, reason: "not_product_id" });
      } else {
        const resolved = await resolveActiveMonthlyPriceIdByProduct(productId, mode);
        if (resolved) {
          priceId = resolved;
          priceSource = "product";
          attempts.push({ source: "product", input: productId, resolvedPriceId: resolved, ok: true });
        } else {
          attempts.push({ source: "product", input: productId, resolvedPriceId: null, ok: false, reason: "no_active_monthly_price" });
        }
      }
    }

    console.log("[API_PROVIDER_SUBSCRIPTION_CHECKOUT]", {
      plan,
      mode,
      lookupKey,
      productId,
      envPriceId,
      envPriceStartsWith: envPriceId ? envPriceId.slice(0, 5) : null,
      resolvedPriceId: priceId,
      priceSource,
      attempts,
      adminHint:
        "If billing fails: env price may be archived/inactive, not a price_ id, wrong Stripe mode/account, or not a monthly recurring price.",
    });

    if (!priceId) {
      return NextResponse.json(
        {
          error: "Billing unavailable: no active monthly price found",
          plan,
          mode,
          lookupKey,
          productId,
          attempts,
        },
        { status: 409 },
      );
    }

    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
      columns: { id: true, stripeCustomerId: true, isSuspended: true, suspensionReason: true, suspensionStartDate: true, suspensionEndDate: true },
    });

    if (!provider) return new NextResponse("Provider not found", { status: 404 });

    const access = assertProviderCanTransactFromProvider(provider);
    if (!access.ok) return access.response;

    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { email: true, firstName: true, lastName: true },
    });

    let customerId = provider.stripeCustomerId ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: dbUser?.email ?? undefined,
        name: `${dbUser?.firstName ?? ""} ${dbUser?.lastName ?? ""}`.trim() || undefined,
        metadata: { userId, providerId: provider.id },
      });
      customerId = customer.id;

      await db
        .update(providers)
        .set({
          stripeCustomerId: customerId,
          stripeSubscriptionUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(providers.id, provider.id));
    } else {
      // Keep Stripe Customer metadata in sync so subscription events can map back to a provider.
      try {
        await stripe.customers.update(customerId, {
          metadata: { userId, providerId: provider.id },
        });
      } catch (err) {
        console.warn("[API_PROVIDER_SUBSCRIPTION_CHECKOUT] Failed to update customer metadata", {
          providerId: provider.id,
          customerId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "";
    const successUrl = parsed.data.successUrl ?? `${origin}/dashboard/provider/billing?success=1`;
    const cancelUrl = parsed.data.cancelUrl ?? `${origin}/dashboard/provider/billing?canceled=1`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId, providerId: provider.id, plan, env: mode },
      // Ensure the created Subscription also carries provider metadata for subscription.* webhooks.
      subscription_data: {
        metadata: { userId, providerId: provider.id, plan, env: mode },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[API_PROVIDER_SUBSCRIPTION_CHECKOUT]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
