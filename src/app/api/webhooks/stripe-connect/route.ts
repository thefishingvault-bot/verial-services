import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { providerEarnings, providerPayouts, providers } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createNotification } from "@/lib/notifications";

// Note: We need to use the 'nodejs' runtime for webhooks
export const runtime = "nodejs";

function mapPayoutStatus(status: string) {
  switch (status) {
    case "paid":
      return "paid" as const;
    case "in_transit":
      return "in_transit" as const;
    case "pending":
      return "pending" as const;
    case "canceled":
      return "canceled" as const;
    case "failed":
      return "failed" as const;
    default:
      return "pending" as const;
  }
}

async function upsertProviderPayout(params: {
  providerId: string;
  payout: Stripe.Payout;
  accountId: string;
  eventId: string;
}) {
  const { providerId, payout, accountId, eventId } = params;

  await db
    .insert(providerPayouts)
    .values({
      id: payout.id,
      providerId,
      stripePayoutId: payout.id,
      amount: payout.amount,
      currency: payout.currency,
      status: mapPayoutStatus(payout.status),
      arrivalDate: payout.arrival_date ? new Date(payout.arrival_date * 1000) : null,
      estimatedArrival: payout.arrival_date ? new Date(payout.arrival_date * 1000) : null,
      failureCode: payout.failure_code || null,
      failureMessage: payout.failure_message || null,
      balanceTransactionId:
        typeof payout.balance_transaction === "string" ? payout.balance_transaction : null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: providerPayouts.id,
      set: {
        amount: payout.amount,
        currency: payout.currency,
        status: mapPayoutStatus(payout.status),
        arrivalDate: payout.arrival_date ? new Date(payout.arrival_date * 1000) : null,
        estimatedArrival: payout.arrival_date ? new Date(payout.arrival_date * 1000) : null,
        failureCode: payout.failure_code || null,
        failureMessage: payout.failure_message || null,
        balanceTransactionId:
          typeof payout.balance_transaction === "string" ? payout.balance_transaction : null,
        updatedAt: new Date(),
      },
    });

  // Best-effort: link earnings rows to this payout via balance transactions.
  // This keeps provider_earnings.status in sync but should not block webhook acknowledgement.
  try {
    const txIds: string[] = [];
    let startingAfter: string | undefined = undefined;
    let pages = 0;

    while (pages < 3) {
      pages += 1;
      const txPage: Stripe.ApiList<Stripe.BalanceTransaction> = await stripe.balanceTransactions.list(
        { payout: payout.id, limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) },
        { stripeAccount: accountId },
      );

      for (const tx of txPage.data) txIds.push(tx.id);

      if (!txPage.has_more || txPage.data.length === 0) break;
      startingAfter = txPage.data[txPage.data.length - 1]?.id;
    }

    if (txIds.length > 0) {
      await db
        .update(providerEarnings)
        .set({
          payoutId: payout.id,
          status: payout.status === "paid" ? "paid_out" : "awaiting_payout",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(providerEarnings.providerId, providerId),
            inArray(providerEarnings.stripeBalanceTransactionId, txIds),
          ),
        );
    }
  } catch (error) {
    console.warn("[API_STRIPE_CONNECT_WEBHOOK] Failed to link earnings to payout", {
      providerId,
      payoutId: payout.id,
      accountId,
      eventId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

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
    matchedBy: provider.matchedBy ?? null,
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
      const accountRef = (person as unknown as { account?: string | Stripe.Account | null }).account;
      const accountId = typeof accountRef === "string" ? accountRef : accountRef?.id;
      console.info("[API_STRIPE_CONNECT_WEBHOOK] person.updated", { accountId, eventId: event.id });
      if (accountId) {
        const account = (await stripe.accounts.retrieve(accountId)) as Stripe.Account;
        await updateProviderFromAccount({ account, eventId: event.id });
      }
      break;
    }

    case "account.external_account.updated": {
      const external = event.data.object as Stripe.BankAccount | Stripe.Card;
      const accountRef = (external as unknown as { account?: string | Stripe.Account | null }).account;
      const accountId = typeof accountRef === "string" ? accountRef : accountRef?.id;
      console.info("[API_STRIPE_CONNECT_WEBHOOK] account.external_account.updated", { accountId, eventId: event.id });
      if (accountId) {
        const account = (await stripe.accounts.retrieve(accountId)) as Stripe.Account;
        await updateProviderFromAccount({ account, eventId: event.id });
      }
      break;
    }

    case "account.application.deauthorized": {
      const obj: unknown = event.data.object as unknown;
      const accountId =
        obj &&
        typeof obj === "object" &&
        "account" in obj &&
        typeof (obj as { account?: unknown }).account === "string"
          ? ((obj as { account: string }).account ?? undefined)
          : undefined;
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

    case "payout.created":
    case "payout.updated":
    case "payout.paid":
    case "payout.failed":
    case "payout.canceled": {
      const payout = event.data.object as Stripe.Payout;
      const accountId = typeof event.account === "string" ? event.account : null;

      console.info("[API_STRIPE_CONNECT_WEBHOOK] payout event", {
        type: event.type,
        payoutId: payout.id,
        status: payout.status,
        accountId,
        eventId: event.id,
      });

      if (!accountId) {
        console.warn("[API_STRIPE_CONNECT_WEBHOOK] Missing event.account for payout", {
          type: event.type,
          payoutId: payout.id,
          eventId: event.id,
        });
        break;
      }

      const provider = await db.query.providers.findFirst({
        where: eq(providers.stripeConnectId, accountId),
        columns: { id: true },
      });

      if (!provider) {
        console.warn("[API_STRIPE_CONNECT_WEBHOOK] No provider found for payout account", {
          accountId,
          payoutId: payout.id,
          eventId: event.id,
        });
        break;
      }

      await upsertProviderPayout({
        providerId: provider.id,
        payout,
        accountId,
        eventId: event.id,
      });

      break;
    }

    default:
      console.log(`[API_STRIPE_CONNECT_WEBHOOK] Unhandled event type: ${event.type}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  return new NextResponse(null, { status: 200 });
}

