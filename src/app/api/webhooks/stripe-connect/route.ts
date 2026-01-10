import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { bookings, providerEarnings, providerPayouts, providers } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createNotification } from "@/lib/notifications";

// Note: We need to use the 'nodejs' runtime for webhooks
export const runtime = "nodejs";

async function markBookingPaid(params: {
  source: string;
  bookingId: string;
  paymentIntentId: string | null;
  eventId: string;
}) {
  const { source, bookingId, paymentIntentId, eventId } = params;

  if (!bookingId) return;
  if (!paymentIntentId) {
    console.info("[API_STRIPE_CONNECT_WEBHOOK] Payment event missing paymentIntentId", {
      source,
      bookingId,
      eventId,
    });
    return;
  }

  const rows = await db
    .update(bookings)
    .set({
      status: "paid",
      paymentIntentId,
      updatedAt: new Date(),
    })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "accepted")))
    .returning({ id: bookings.id, status: bookings.status, paymentIntentId: bookings.paymentIntentId });

  console.info("[API_STRIPE_CONNECT_WEBHOOK] Booking marked paid", {
    source,
    bookingId,
    paymentIntentId,
    eventId,
    updated: rows.length > 0,
  });
}

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
      stripeAccountId: accountId,
      stripePayoutId: payout.id,
      amount: payout.amount,
      currency: payout.currency,
      status: mapPayoutStatus(payout.status),
      arrivalDate: payout.arrival_date ? new Date(payout.arrival_date * 1000) : null,
      estimatedArrival: payout.arrival_date ? new Date(payout.arrival_date * 1000) : null,

      stripeCreatedAt: payout.created ? new Date(payout.created * 1000) : null,
      raw: payout,

      failureCode: payout.failure_code || null,
      failureMessage: payout.failure_message || null,
      balanceTransactionId:
        typeof payout.balance_transaction === "string" ? payout.balance_transaction : null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: providerPayouts.id,
      set: {
        stripeAccountId: accountId,
        amount: payout.amount,
        currency: payout.currency,
        status: mapPayoutStatus(payout.status),
        arrivalDate: payout.arrival_date ? new Date(payout.arrival_date * 1000) : null,
        estimatedArrival: payout.arrival_date ? new Date(payout.arrival_date * 1000) : null,

        stripeCreatedAt: payout.created ? new Date(payout.created * 1000) : null,
        raw: payout,

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

async function resolveProviderForConnectAccount(params: {
  accountId: string;
  eventId: string;
}): Promise<{ providerId: string } | null> {
  const { accountId, eventId } = params;

  const byConnectId = await db.query.providers.findFirst({
    where: eq(providers.stripeConnectId, accountId),
    columns: { id: true },
  });

  if (byConnectId) return { providerId: byConnectId.id };

  try {
    const account = (await stripe.accounts.retrieve(accountId)) as Stripe.Account;
    const metadataProviderId = providerIdFromAccountMetadata(account);
    if (!metadataProviderId) return null;

    const byProviderId = await db.query.providers.findFirst({
      where: eq(providers.id, metadataProviderId),
      columns: { id: true, stripeConnectId: true },
    });

    if (!byProviderId) return null;

    // Best-effort: persist the connect account id on the provider.
    if (!byProviderId.stripeConnectId) {
      await db
        .update(providers)
        .set({ stripeConnectId: accountId, updatedAt: new Date() })
        .where(eq(providers.id, byProviderId.id));
    }

    return { providerId: byProviderId.id };
  } catch (error) {
    console.warn("[API_STRIPE_CONNECT_WEBHOOK] Failed to resolve provider via account metadata", {
      accountId,
      eventId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
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

  const webhookSecrets: Array<{ name: string; value: string }> = [
    // ✅ Connect/Provider payout webhook secret (new)
    {
      name: "PROVIDER_PAYOUT_STRIPE_WEBHOOK_SECRET",
      value: process.env.PROVIDER_PAYOUT_STRIPE_WEBHOOK_SECRET ?? "",
    },

    // Existing ones
    { name: "STRIPE_CONNECT_WEBHOOK_SECRET", value: process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? "" },
    { name: "STRIPE_WEBHOOK_SECRET", value: process.env.STRIPE_WEBHOOK_SECRET ?? "" },
    { name: "STRIPE_BILLING_WEBHOOK_SECRET", value: process.env.STRIPE_BILLING_WEBHOOK_SECRET ?? "" },
  ].filter((s) => !!s.value);

  if (webhookSecrets.length === 0) {
    console.error("[API_STRIPE_CONNECT_WEBHOOK] No Stripe webhook secrets configured", {
      expected: [
        "PROVIDER_PAYOUT_STRIPE_WEBHOOK_SECRET",
        "STRIPE_CONNECT_WEBHOOK_SECRET",
        "STRIPE_WEBHOOK_SECRET",
        "STRIPE_BILLING_WEBHOOK_SECRET",
      ],
    });
    return new NextResponse("Webhook secret not configured", { status: 500 });
  }

  if (!signature) {
    return new NextResponse("Missing Stripe-Signature header", { status: 400 });
  }

  let event: Stripe.Event | null = null;
  let verifiedWith: string | null = null;
  let lastError: unknown = null;

  for (const secret of webhookSecrets) {
    try {
      event = stripe.webhooks.constructEvent(body, signature, secret.value);
      verifiedWith = secret.name;
      break;
    } catch (error: unknown) {
      lastError = error;
    }
  }

  if (!event) {
    const message = lastError instanceof Error ? lastError.message : "Unknown error";
    console.warn(`[API_STRIPE_CONNECT_WEBHOOK] Webhook signature verification failed: ${message}`);
    return new NextResponse(`Webhook Error: ${message}`, { status: 400 });
  }

  console.info("[API_STRIPE_CONNECT_WEBHOOK] Webhook verified", {
    verifiedWith,
    eventId: event.id,
    type: event.type,
    account: typeof event.account === "string" ? event.account : null,
  });

  // Handle the event
  switch (event.type as string) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      const bookingId = (session.metadata as Record<string, string> | null | undefined)?.bookingId ?? null;
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null;

      console.info("[API_STRIPE_CONNECT_WEBHOOK] checkout.session.completed", {
        eventId: event.id,
        bookingId,
        paymentIntentId,
        mode: session.mode,
      });

      if (!bookingId) break;

      // Best-effort: do not throw if bookingId/paymentIntentId missing.
      await markBookingPaid({
        source: event.type,
        bookingId,
        paymentIntentId,
        eventId: event.id,
      });
      break;
    }

    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const bookingId = (pi.metadata as Record<string, string> | null | undefined)?.bookingId ?? null;

      console.info("[API_STRIPE_CONNECT_WEBHOOK] payment_intent.succeeded", {
        eventId: event.id,
        bookingId,
        paymentIntentId: pi.id,
      });

      if (!bookingId) break;

      await markBookingPaid({
        source: event.type,
        bookingId,
        paymentIntentId: pi.id,
        eventId: event.id,
      });
      break;
    }

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
    case "payout.canceled":
    case "payout.cancelled": {
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

      const provider = await resolveProviderForConnectAccount({ accountId, eventId: event.id });
      if (!provider) {
        console.warn("[API_STRIPE_CONNECT_WEBHOOK] No provider found for payout account", {
          accountId,
          payoutId: payout.id,
          eventId: event.id,
        });
        break;
      }

      await upsertProviderPayout({
        providerId: provider.providerId,
        payout,
        accountId,
        eventId: event.id,
      });

      console.info("[API_STRIPE_CONNECT_WEBHOOK] payout processed", {
        providerId: provider.providerId,
        stripeAccountId: accountId,
        payoutId: payout.id,
        status: payout.status,
        amount: payout.amount,
        currency: payout.currency,
        arrivalDate: payout.arrival_date ?? null,
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

