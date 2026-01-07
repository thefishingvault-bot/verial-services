import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createNotification } from "@/lib/notifications";

// Note: We need to use the 'nodejs' runtime for webhooks
export const runtime = "nodejs";

function providerIdFromAccountMetadata(account: Stripe.Account): string | null {
  const value = (account.metadata as Record<string, string | undefined> | undefined)?.providerId;
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

async function updateProviderFromAccount(params: {
  account: Stripe.Account;
  eventId: string;
}): Promise<
  | { ok: true; providerId: string; stripeConnectId: string; chargesEnabled: boolean; payoutsEnabled: boolean; userId: string | null }
  | { ok: false; reason: "provider_not_found" | "no_match"; stripeConnectId: string }
> {
  const { account, eventId } = params;

  const stripeConnectId = account.id;
  const metadataProviderId = providerIdFromAccountMetadata(account);

  // Prefer matching by connect account id (strongest link), fall back to metadata.
  const byConnectId = await db.query.providers.findFirst({
    where: eq(providers.stripeConnectId, stripeConnectId),
    columns: {
      id: true,
      userId: true,
      stripeConnectId: true,
      chargesEnabled: true,
      payoutsEnabled: true,
    },
  });

  let provider:
    | ({
        id: string;
        userId: string;
        stripeConnectId: string | null;
        chargesEnabled: boolean;
        payoutsEnabled: boolean;
      } & { matchedBy: "stripe_connect_id" | "metadata.providerId" })
    | null = null;

  if (byConnectId) {
    provider = { ...byConnectId, matchedBy: "stripe_connect_id" };
  } else if (metadataProviderId) {
    const byProviderId = await db.query.providers.findFirst({
      where: eq(providers.id, metadataProviderId),
      columns: {
        id: true,
        userId: true,
        stripeConnectId: true,
        chargesEnabled: true,
        payoutsEnabled: true,
      },
    });

    if (byProviderId) {
      provider = { ...byProviderId, matchedBy: "metadata.providerId" };
    }
  }

  if (!provider) {
    return { ok: false, reason: "provider_not_found", stripeConnectId };
  }

  const prevChargesEnabled = provider.chargesEnabled;
  const prevPayoutsEnabled = provider.payoutsEnabled;

  await db
    .update(providers)
    .set({
      stripeConnectId: provider.stripeConnectId ?? stripeConnectId,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      updatedAt: new Date(),
    })
    .where(eq(providers.id, provider.id));

  console.info("[API_STRIPE_CONNECT_WEBHOOK] Provider updated", {
    providerId: provider.id,
    accountId: stripeConnectId,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    eventId,
    matchedBy: (provider as any).matchedBy ?? null,
  });

  // Best-effort notifications (do not block webhook response)
  if (provider.userId) {
    const base = {
      userId: provider.userId,
      type: "stripe_connect",
      actionUrl: "/dashboard/provider/earnings",
      providerId: provider.id,
      idempotencyKey: `stripe-connect:${eventId}:${provider.userId}`,
      ttlSeconds: 60 * 60 * 24,
    } as const;

    if (prevPayoutsEnabled !== account.payouts_enabled) {
      void createNotification({
        ...base,
        title: account.payouts_enabled ? "Payouts enabled" : "Payouts disabled",
        body: account.payouts_enabled
          ? "Your Stripe payouts are enabled. You can now receive payouts for paid bookings."
          : "Your Stripe payouts are currently disabled. You may need to complete additional verification in Stripe.",
      }).catch((err) => {
        console.warn("[API_STRIPE_CONNECT_WEBHOOK] Notification failed", {
          providerId: provider.id,
          eventId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    if (prevChargesEnabled !== account.charges_enabled) {
      void createNotification({
        ...base,
        title: account.charges_enabled ? "Payments enabled" : "Payments disabled",
        body: account.charges_enabled
          ? "You can now accept payments for new bookings."
          : "Your ability to accept payments is currently disabled. Please review your Stripe Connect status.",
      }).catch((err) => {
        console.warn("[API_STRIPE_CONNECT_WEBHOOK] Notification failed", {
          providerId: provider.id,
          eventId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  }

  return {
    ok: true,
    providerId: provider.id,
    stripeConnectId,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    userId: provider.userId ?? null,
  };
}

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature") ?? req.headers.get("Stripe-Signature");
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET; // Use the *CONNECT* secret

  if (!webhookSecret) {
    console.error("[API_STRIPE_CONNECT_WEBHOOK] Missing Stripe Connect webhook secret");
    return new NextResponse("Webhook secret not configured", { status: 500 });
  }

  if (!signature) {
    return new NextResponse("Missing Stripe-Signature header", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`[API_STRIPE_CONNECT_WEBHOOK] Webhook signature verification failed: ${message}`);
    return new NextResponse(`Webhook Error: ${message}`, { status: 400 });
  }

  // Handle the event
  switch (event.type) {
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      console.info("[API_STRIPE_CONNECT_WEBHOOK] account.updated", { accountId: account.id, eventId: event.id });
      await updateProviderFromAccount({ account, eventId: event.id });
      break;
    }

    case "capability.updated": {
      const capability = event.data.object as Stripe.Capability;
      const accountId = typeof capability.account === "string" ? capability.account : capability.account?.id;
      console.info("[API_STRIPE_CONNECT_WEBHOOK] capability.updated", { accountId, eventId: event.id });
      if (accountId) {
        const account = (await stripe.accounts.retrieve(accountId)) as Stripe.Account;
        await updateProviderFromAccount({ account, eventId: event.id });
      }
      break;
    }

    case "person.updated": {
      const person = event.data.object as Stripe.Person;
      const accountId = typeof person.account === "string" ? person.account : (person.account as any)?.id;
      console.info("[API_STRIPE_CONNECT_WEBHOOK] person.updated", { accountId, eventId: event.id });
      if (accountId) {
        const account = (await stripe.accounts.retrieve(accountId)) as Stripe.Account;
        await updateProviderFromAccount({ account, eventId: event.id });
      }
      break;
    }

    case "account.external_account.updated": {
      const external = event.data.object as Stripe.BankAccount | Stripe.Card;
      const accountId = typeof (external as any).account === "string" ? (external as any).account : (external as any).account?.id;
      console.info("[API_STRIPE_CONNECT_WEBHOOK] account.external_account.updated", { accountId, eventId: event.id });
      if (accountId) {
        const account = (await stripe.accounts.retrieve(accountId)) as Stripe.Account;
        await updateProviderFromAccount({ account, eventId: event.id });
      }
      break;
    }

    case "account.application.deauthorized": {
      const obj = event.data.object as any;
      const accountId: string | undefined = obj?.account;
      console.info("[API_STRIPE_CONNECT_WEBHOOK] account.application.deauthorized", { accountId, eventId: event.id });
      if (accountId) {
        const provider = await db.query.providers.findFirst({
          where: eq(providers.stripeConnectId, accountId),
          columns: { id: true },
        });

        if (provider) {
          await db
            .update(providers)
            .set({
              chargesEnabled: false,
              payoutsEnabled: false,
              updatedAt: new Date(),
            })
            .where(eq(providers.id, provider.id));
        }
      }
      break;
    }

    default:
      console.log(`[API_STRIPE_CONNECT_WEBHOOK] Unhandled event type: ${event.type}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  return new NextResponse(null, { status: 200 });
}

