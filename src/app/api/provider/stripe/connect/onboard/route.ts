import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

function isAccountUpdateNotAllowed(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("account_update") && msg.includes("Valid types") && msg.includes("account_onboarding");
}

function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (explicit && explicit.trim()) return explicit.trim().replace(/\/$/, "");

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  return "http://localhost:3000";
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const provider = await db.query.providers.findFirst({
    where: eq(providers.userId, userId),
    columns: { id: true, userId: true, stripeConnectId: true },
  });

  if (!provider) {
    return new NextResponse("Provider not found.", { status: 404 });
  }

  const hadConnectId = !!provider.stripeConnectId;
  console.info("[STRIPE_CONNECT_ONBOARD_CLICK]", {
    providerId: provider.id,
    hadConnectId,
  });

  try {
    let stripeConnectId = provider.stripeConnectId ?? null;

    if (!stripeConnectId) {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const email = user.emailAddresses?.[0]?.emailAddress;

      const account = await stripe.accounts.create({
        type: "express",
        ...(email ? { email } : {}),
        metadata: {
          providerId: provider.id,
          userId,
        },
      });

      stripeConnectId = account.id;

      await db
        .update(providers)
        .set({ stripeConnectId })
        .where(eq(providers.id, provider.id));
    }

    // Best-effort: ensure metadata exists so webhooks can map.
    try {
      await stripe.accounts.update(stripeConnectId, {
        metadata: {
          providerId: provider.id,
          userId,
        },
      });
    } catch {
      // ignore
    }

    const account = await stripe.accounts.retrieve(stripeConnectId);

    console.info("[STRIPE_CONNECT_ONBOARD_STATUS]", {
      providerId: provider.id,
      stripeConnectId,
      accountType: account.type,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    });

    // Until payouts are enabled, always send through onboarding.
    // Only attempt account_update once payouts are enabled AND Stripe supports it.
    const preferOnboarding = !account.payouts_enabled;
    const desiredLinkType: "account_onboarding" | "account_update" =
      preferOnboarding ? "account_onboarding" : account.details_submitted ? "account_update" : "account_onboarding";

    const siteUrl = getSiteUrl();
    const returnPath = "/dashboard/provider/earnings";

    let accountLink: { url: string };
    try {
      accountLink = await stripe.accountLinks.create({
        account: stripeConnectId,
        refresh_url: `${siteUrl}${returnPath}`,
        return_url: `${siteUrl}${returnPath}`,
        type: desiredLinkType,
      });
    } catch (error) {
      if (desiredLinkType === "account_update" && isAccountUpdateNotAllowed(error)) {
        // Retry immediately with onboarding so the UX never dead-ends.
        accountLink = await stripe.accountLinks.create({
          account: stripeConnectId,
          refresh_url: `${siteUrl}${returnPath}`,
          return_url: `${siteUrl}${returnPath}`,
          type: "account_onboarding",
        });
      } else {
        throw error;
      }
    }

    return NextResponse.json({ url: accountLink.url });
  } catch (error) {
    console.error("[STRIPE_CONNECT_ONBOARD_FAILED]", {
      providerId: provider.id,
      hadConnectId,
      error: error instanceof Error ? error.message : String(error),
    });

    return new NextResponse("Unable to start Stripe onboarding. Please try again.", {
      status: 500,
    });
  }
}
