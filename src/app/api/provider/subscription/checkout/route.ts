import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { providers, users } from "@/db/schema";
import { getStripePriceIdForPlan, normalizeProviderPlan } from "@/lib/provider-subscription";
import { checkProvidersColumnsExist } from "@/lib/provider-subscription-schema";

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
    const priceId = getStripePriceIdForPlan(plan);
    if (!priceId) {
      return NextResponse.json(
        { error: `Missing Stripe price id for plan ${plan}. Set STRIPE_PRICE_PRO_MONTHLY / STRIPE_PRICE_ELITE_MONTHLY.` },
        { status: 500 },
      );
    }

    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
      columns: { id: true, stripeCustomerId: true },
    });

    if (!provider) return new NextResponse("Provider not found", { status: 404 });

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
      metadata: { userId, providerId: provider.id, plan },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[API_PROVIDER_SUBSCRIPTION_CHECKOUT]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
