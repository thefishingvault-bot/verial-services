import { db } from "@/lib/db";
import { providers } from "@/lib/db/schema";
import { stripe } from "@/lib/stripe";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Get the base site URL from environment variables
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    let provider = await db.query.providers.findFirst({
      where: (p, { eq }) => eq(p.userId, userId),
    });

    if (!provider) {
      return new NextResponse("Provider not found.", { status: 404 });
    }

    // --- 1. Create a Stripe Connect account if one doesn't exist ---
    if (!provider.stripeConnectId) {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      
      const account = await stripe.accounts.create({
        type: "standard", // Standard accounts are easiest for NZ
        email: user.emailAddresses[0].emailAddress,
      });

      // Save the new Connect ID to our database
      const [updatedProvider] = await db.update(providers)
        .set({ stripeConnectId: account.id })
        .where(eq(providers.userId, userId))
        .returning();
      
      provider = updatedProvider;
    }

    // --- 2. Create the Account Link ---
    const accountLink = await stripe.accountLinks.create({
      account: provider.stripeConnectId!,
      refresh_url: `${siteUrl}/dashboard/payouts`,
      return_url: `${siteUrl}/dashboard/payouts`,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: accountLink.url });

  } catch (error) {
    console.error("[API_CREATE_ACCOUNT_LINK]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

