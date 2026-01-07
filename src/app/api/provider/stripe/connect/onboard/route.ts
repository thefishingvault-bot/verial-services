import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

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
      });

      stripeConnectId = account.id;

      await db
        .update(providers)
        .set({ stripeConnectId })
        .where(eq(providers.id, provider.id));
    }

    // Decide whether we should send the user through onboarding again or an update flow.
    // `account_onboarding` works for both new and existing accounts, but `account_update`
    // can be a better UX once details have been submitted.
    let linkType: "account_onboarding" | "account_update" = "account_onboarding";
    try {
      const account = await stripe.accounts.retrieve(stripeConnectId);
      if (account.details_submitted) {
        linkType = "account_update";
      }
    } catch {
      // Best-effort: default to onboarding.
    }

    const siteUrl = getSiteUrl();
    const returnPath = "/dashboard/provider/earnings";

    const accountLink = await stripe.accountLinks.create({
      account: stripeConnectId,
      refresh_url: `${siteUrl}${returnPath}`,
      return_url: `${siteUrl}${returnPath}`,
      type: linkType,
    });

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
