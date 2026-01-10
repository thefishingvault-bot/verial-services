import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { bookings, providerEarnings, providers, refunds } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { assertTransition, BookingStatus } from "@/lib/booking-state";
import { createNotification, createNotificationOnce } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { clerkClient } from "@clerk/nextjs/server";
import { calculateEarnings } from "@/lib/earnings";
import { isStripeSubscribedStatus, resolvePlanFromStripeDetails, type ProviderPlan } from "@/lib/provider-subscription";
import { retrieveStripePriceSafe, detectStripeMode } from "@/lib/stripe";

// Note: We need to use the 'nodejs' runtime for webhooks
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const signature = (headersList.get("stripe-signature") ?? headersList.get("Stripe-Signature")) as string;

  const webhookSecrets: Array<{ name: string; value: string }> = [
    { name: "STRIPE_WEBHOOK_SECRET", value: process.env.STRIPE_WEBHOOK_SECRET ?? "" },
    { name: "STRIPE_BILLING_WEBHOOK_SECRET", value: process.env.STRIPE_BILLING_WEBHOOK_SECRET ?? "" },
    // Safety: some environments accidentally set the booking webhook to the connect secret.
    { name: "STRIPE_CONNECT_WEBHOOK_SECRET", value: process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? "" },
  ].filter((s) => !!s.value);

  if (webhookSecrets.length === 0) {
    console.error("[API_STRIPE_WEBHOOK] Missing Stripe webhook secret");
    return new NextResponse("Webhook secret not configured", { status: 500 });
  }

  if (!signature) {
    console.warn("[API_STRIPE_WEBHOOK] Missing Stripe-Signature header");
    return new NextResponse("Missing Stripe-Signature header", { status: 400 });
  }

  let event: Stripe.Event | null = null;
  let verifiedWith: string | null = null;

  try {
    let lastError: unknown = null;
    for (const secret of webhookSecrets) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, secret.value);
        verifiedWith = secret.name;
        lastError = null;
        break;
      } catch (error: unknown) {
        lastError = error;
      }
    }

    if (!verifiedWith) {
      const message = lastError instanceof Error ? lastError.message : "Unknown error";
      console.warn(`[API_STRIPE_WEBHOOK] Webhook signature verification failed: ${message}`);
      return new NextResponse(`Webhook Error: ${message}`, { status: 400 });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`[API_STRIPE_WEBHOOK] Webhook signature verification failed: ${message}`);
    return new NextResponse(`Webhook Error: ${message}`, { status: 400 });
  }

  if (!event) {
    console.warn("[API_STRIPE_WEBHOOK] Webhook verified but event is missing");
    return new NextResponse("Webhook Error: missing event", { status: 400 });
  }

  const mode = detectStripeMode();
  console.info("[API_STRIPE_WEBHOOK] Verified", {
    ok: true,
    type: event.type,
    eventId: event.id,
    account: (event as unknown as { account?: string | null }).account ?? null,
    livemode: (event as unknown as { livemode?: boolean }).livemode ?? null,
    mode,
    verifiedWith,
  });

  const resolveProviderIdFromCustomer = async (customerId: string | null): Promise<string | null> => {
    if (!customerId) return null;
    try {
      const customer = await stripe.customers.retrieve(customerId);
      const meta = (customer as unknown as { metadata?: Record<string, string> }).metadata;
      return meta?.providerId ?? null;
    } catch {
      return null;
    }
  };

  const updateProviderSubscription = async (params: {
    source: string;
    providerId?: string | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    stripeSubscriptionStatus: string | null;
    stripeSubscriptionPriceId: string | null;
    stripeCurrentPeriodEnd: Date | null;
    stripeCancelAtPeriodEnd: boolean;
    plan: ProviderPlan;
  }) => {
    const {
      source,
      providerId,
      stripeCustomerId,
      stripeSubscriptionId,
      stripeSubscriptionStatus,
      stripeSubscriptionPriceId,
      stripeCurrentPeriodEnd,
      stripeCancelAtPeriodEnd,
      plan,
    } = params;

    if (!providerId && !stripeCustomerId && !stripeSubscriptionId) {
      console.warn("[API_STRIPE_WEBHOOK] Cannot update provider subscription (missing identifiers)", {
        source,
        stripeCustomerId,
        stripeSubscriptionId,
      });
      return;
    }

    let updatedProviderId: string | null = null;

    if (providerId) {
      const res = await db
        .update(providers)
        .set({
          plan,
          stripeCustomerId: stripeCustomerId ?? undefined,
          stripeSubscriptionId,
          stripeSubscriptionStatus,
          stripeSubscriptionPriceId,
          stripeCurrentPeriodEnd,
          stripeCancelAtPeriodEnd,
          stripeSubscriptionUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(providers.id, providerId))
        .returning({ id: providers.id });
      updatedProviderId = res[0]?.id ?? null;
    } else if (stripeCustomerId) {
      const res = await db
        .update(providers)
        .set({
          plan,
          stripeCustomerId,
          stripeSubscriptionId,
          stripeSubscriptionStatus,
          stripeSubscriptionPriceId,
          stripeCurrentPeriodEnd,
          stripeCancelAtPeriodEnd,
          stripeSubscriptionUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(providers.stripeCustomerId, stripeCustomerId))
        .returning({ id: providers.id });
      updatedProviderId = res[0]?.id ?? null;
    } else if (stripeSubscriptionId) {
      const res = await db
        .update(providers)
        .set({
          plan,
          stripeSubscriptionId,
          stripeSubscriptionStatus,
          stripeSubscriptionPriceId,
          stripeCurrentPeriodEnd,
          stripeCancelAtPeriodEnd,
          stripeSubscriptionUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(providers.stripeSubscriptionId, stripeSubscriptionId))
        .returning({ id: providers.id });
      updatedProviderId = res[0]?.id ?? null;
    }

    console.info("[API_STRIPE_WEBHOOK] Provider subscription updated", {
      source,
      providerId: providerId ?? updatedProviderId,
      stripeCustomerId,
      stripeSubscriptionId,
      status: stripeSubscriptionStatus,
      plan,
      priceId: stripeSubscriptionPriceId,
      currentPeriodEnd: stripeCurrentPeriodEnd ? stripeCurrentPeriodEnd.toISOString() : null,
      cancelAtPeriodEnd: stripeCancelAtPeriodEnd,
    });

    if (!updatedProviderId && !providerId) {
      console.warn("[API_STRIPE_WEBHOOK] No provider row updated", {
        source,
        stripeCustomerId,
        stripeSubscriptionId,
      });
    }
  };

  const resolvePlanForSubscription = async (subscription: Stripe.Subscription): Promise<{
    plan: ProviderPlan;
    priceId: string | null;
    lookupKey: string | null;
    productId: string | null;
    productName: string | null;
    resolutionSource: "lookup_key" | "env_price_id" | "env_product_id" | "product_name" | "none";
    matched: boolean;
  }> => {
    const items = subscription.items?.data ?? [];
    const item = items[0] ?? null;

    const itemPriceId = item?.price?.id ?? null;
    const lookupKey = (item?.price as unknown as { lookup_key?: string | null } | null)?.lookup_key ?? null;

    const rawProduct = (item?.price as unknown as { product?: string | Stripe.Product | null } | null)?.product ?? null;
    const productId = typeof rawProduct === "string" ? rawProduct : rawProduct?.id ?? null;
    const productName = typeof rawProduct === "string" ? null : rawProduct?.name ?? null;

    // If price wasn't expanded to include lookup_key, fetch it.
    let effectiveLookupKey = lookupKey;
    let effectiveProductId = productId;
    let effectiveProductName = productName;

    if (!effectiveLookupKey && itemPriceId) {
      const price = await retrieveStripePriceSafe(itemPriceId);
      effectiveLookupKey = (price as unknown as { lookup_key?: string | null })?.lookup_key ?? null;

      const raw = (price as unknown as { product?: string | Stripe.Product | null })?.product ?? null;
      effectiveProductId = typeof raw === "string" ? raw : raw?.id ?? effectiveProductId ?? null;
      effectiveProductName = typeof raw === "string" ? null : raw?.name ?? effectiveProductName ?? null;
    }

    let resolution = resolvePlanFromStripeDetails({
      mode,
      priceId: itemPriceId,
      lookupKey: effectiveLookupKey,
      productId: effectiveProductId,
      productName: effectiveProductName,
    });

    if (resolution.plan === "unknown" && effectiveProductId && !effectiveProductName) {
      try {
        const prod = await stripe.products.retrieve(effectiveProductId);
        effectiveProductName = prod?.name ?? null;
      } catch {
        effectiveProductName = null;
      }

      resolution = resolvePlanFromStripeDetails({
        mode,
        priceId: itemPriceId,
        lookupKey: effectiveLookupKey,
        productId: effectiveProductId,
        productName: effectiveProductName,
      });
    }

    return {
      plan: resolution.plan,
      priceId: itemPriceId,
      lookupKey: effectiveLookupKey,
      productId: effectiveProductId,
      productName: effectiveProductName,
      resolutionSource: resolution.source,
      matched: resolution.matched,
    };
  };

  const loadBooking = async (bookingId: string) =>
    db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
      columns: {
        id: true,
        status: true,
        priceAtBooking: true,
        providerId: true,
        serviceId: true,
        userId: true,
        paymentIntentId: true,
      },
      with: {
        provider: { columns: { userId: true, businessName: true } },
        service: { columns: { title: true } },
      },
    });

  const notifyCustomer = async (
    userId: string,
    bookingId: string,
    title: string,
    body: string,
  ) =>
    createNotification({
      userId,
      title,
      body,
      bookingId,
      actionUrl: `/dashboard/bookings/${bookingId}`,
    });

  const syncRefundRecord = async (stripeRefund: Stripe.Refund, bookingIdFallback?: string | null) => {
    const refundIdMeta = stripeRefund.metadata?.refundId;
    const bookingIdMeta = stripeRefund.metadata?.bookingId ?? bookingIdFallback ?? null;

    const status = stripeRefund.status;
    const mappedStatus =
      status === "succeeded" ? "completed" : status === "failed" || status === "canceled" ? "failed" : "processing";

    const update = {
      stripeRefundId: stripeRefund.id,
      status: mappedStatus,
      processedAt: status === "succeeded" ? new Date() : null,
      updatedAt: new Date(),
    } as const;

    if (refundIdMeta) {
      await db.update(refunds).set(update).where(eq(refunds.id, refundIdMeta));
      return;
    }

    // Fallbacks: match by Stripe refund id, or by booking id when available.
    await db.update(refunds).set(update).where(eq(refunds.stripeRefundId, stripeRefund.id));

    if (bookingIdMeta && mappedStatus === "completed") {
      await db.update(refunds)
        .set({ status: "completed", processedAt: new Date(), updatedAt: new Date() })
        .where(eq(refunds.bookingId, bookingIdMeta));
    }
  };

  const markRefunded = async (bookingId: string) => {
    const booking = await loadBooking(bookingId);
    if (!booking) return NextResponse.json({ ok: true });

    try {
      assertTransition(booking.status as BookingStatus, "refunded");
    } catch (err) {
      console.warn(`[API_STRIPE_WEBHOOK] Invalid refund transition for ${bookingId}:`, err);
      return NextResponse.json({ ok: true });
    }

    await db
      .update(bookings)
      .set({ status: "refunded", updatedAt: new Date() })
      .where(eq(bookings.id, bookingId));

    await db
      .update(providerEarnings)
      .set({ status: "refunded", updatedAt: new Date() })
      .where(eq(providerEarnings.bookingId, bookingId));

    if (booking.userId) {
      await notifyCustomer(
        booking.userId,
        bookingId,
        "Payment refunded",
        `Your payment for ${booking.service?.title ?? "your booking"} was refunded.`,
      );
    }

    if (booking.provider?.userId) {
      await createNotification({
        userId: booking.provider.userId,
        title: "Booking refunded",
        body: `A refund was processed for booking ${bookingId}.`,
        bookingId,
        type: "payment",
        actionUrl: `/dashboard/provider/bookings/${bookingId}`,
        providerId: booking.providerId,
        serviceId: booking.serviceId,
      });
    }

    return NextResponse.json({ ok: true });
  };

  // Handle the event
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      // Only handle subscription checkouts here (booking payments are PaymentIntents)
      if (session.mode !== "subscription") break;

      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (!customerId || !subscriptionId) break;

      const providerId = (session.metadata as Record<string, string> | null | undefined)?.providerId ?? null;
      const userId = (session.metadata as Record<string, string> | null | undefined)?.userId ?? null;
      const planMeta = (session.metadata as Record<string, string> | null | undefined)?.plan ?? null;

      console.info("[API_STRIPE_WEBHOOK] Billing checkout completed", {
        type: event.type,
        livemode: (event as unknown as { livemode?: boolean }).livemode ?? null,
        providerId,
        userId,
        plan: planMeta,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
      });

      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
          // Avoid deep expands.
          expand: ["items.data.price"],
        });
        const subscribed = isStripeSubscribedStatus(subscription.status);
        const resolved = await resolvePlanForSubscription(subscription);
        const plan: ProviderPlan = subscribed ? resolved.plan : "starter";

        console.info("[API_STRIPE_WEBHOOK] Subscription mapped", {
          source: event.type,
          providerId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          status: subscription.status,
          priceId: resolved.priceId,
          lookupKey: resolved.lookupKey,
          productId: resolved.productId,
          productName: resolved.productName,
          resolvedPlan: plan,
          resolutionSource: resolved.resolutionSource,
        });

        const currentPeriodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end;

        await updateProviderSubscription({
          source: event.type,
          providerId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          stripeSubscriptionStatus: subscription.status,
          stripeSubscriptionPriceId: resolved.priceId,
          stripeCurrentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
          stripeCancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
          plan,
        });
      } catch (err) {
        console.warn("[API_STRIPE_WEBHOOK] Failed to sync checkout subscription", err);
      }

      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

      const providerIdFromSubMeta = (subscription.metadata as Record<string, string> | undefined)?.providerId ?? null;
      const providerId = providerIdFromSubMeta ?? (await resolveProviderIdFromCustomer(customerId));

      const subscribed = isStripeSubscribedStatus(subscription.status);
      const resolved = await resolvePlanForSubscription(subscription);
      const plan: ProviderPlan = event.type === "customer.subscription.deleted" ? "starter" : subscribed ? resolved.plan : "starter";

      console.info("[API_STRIPE_WEBHOOK] Subscription mapped", {
        source: event.type,
        providerId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        status: subscription.status,
        priceId: resolved.priceId,
        lookupKey: resolved.lookupKey,
        productId: resolved.productId,
        productName: resolved.productName,
        resolvedPlan: plan,
        resolutionSource: resolved.resolutionSource,
        matched: resolved.matched,
      });

      const currentPeriodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end;

      await updateProviderSubscription({
        source: event.type,
        providerId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripeSubscriptionStatus: subscription.status,
        stripeSubscriptionPriceId: resolved.priceId,
        stripeCurrentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
        stripeCancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
        plan,
      });

      break;
    }

    case "invoice.paid":
    case "invoice.payment_succeeded": {
      // These events can reflect status transitions; resync the linked subscription if present.
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionRef = (invoice as unknown as { subscription?: string | Stripe.Subscription | null }).subscription;
      const subscriptionId = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (!subscriptionId) break;

      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["items.data.price"],
        });
        const subscribed = isStripeSubscribedStatus(subscription.status);
        const resolved = await resolvePlanForSubscription(subscription);
        const plan: ProviderPlan = subscribed ? resolved.plan : "starter";

        const providerIdFromSubMeta = (subscription.metadata as Record<string, string> | undefined)?.providerId ?? null;
        const providerId = providerIdFromSubMeta ?? (await resolveProviderIdFromCustomer(customerId ?? null));

        console.info("[API_STRIPE_WEBHOOK] Subscription mapped", {
          source: event.type,
          providerId,
          stripeCustomerId: customerId ?? null,
          stripeSubscriptionId: subscription.id,
          status: subscription.status,
          priceId: resolved.priceId,
          lookupKey: resolved.lookupKey,
          productId: resolved.productId,
          productName: resolved.productName,
          resolvedPlan: plan,
          resolutionSource: resolved.resolutionSource,
          matched: resolved.matched,
        });
        const currentPeriodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end;

        await updateProviderSubscription({
          source: event.type,
          providerId,
          stripeCustomerId: customerId ?? (typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id) ?? null,
          stripeSubscriptionId: subscription.id,
          stripeSubscriptionStatus: subscription.status,
          stripeSubscriptionPriceId: resolved.priceId,
          stripeCurrentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
          stripeCancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
          plan,
        });
      } catch (err) {
        console.warn("[API_STRIPE_WEBHOOK] Failed to sync subscription from invoice event", {
          eventId: event.id,
          type: event.type,
          subscriptionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      break;
    }

    case "payment_intent.succeeded":
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      const bookingIdFromMeta = (paymentIntent.metadata as Record<string, string | undefined> | undefined)?.bookingId;

      // Resolve booking id by metadata first; fall back to lookup by stored paymentIntentId.
      let bookingId = typeof bookingIdFromMeta === "string" && bookingIdFromMeta.trim() ? bookingIdFromMeta : null;
      if (!bookingId) {
        const byPi = await db.query.bookings.findFirst({
          where: eq(bookings.paymentIntentId, paymentIntent.id),
          columns: { id: true },
        });
        bookingId = byPi?.id ?? null;
      }

      if (!bookingId) {
        console.error(`[API_STRIPE_WEBHOOK] Missing booking linkage for PaymentIntent ${paymentIntent.id}`);
        // Return 200 so Stripe doesn't retry forever; without linkage we can't update.
        return new NextResponse("Metadata missing", { status: 200 });
      }

      console.info("[API_STRIPE_WEBHOOK] payment_intent.succeeded", {
        eventId: event.id,
        type: event.type,
        account: (event as unknown as { account?: string | null }).account ?? null,
        paymentIntentId: paymentIntent.id,
        paymentIntentStatus: paymentIntent.status,
        metadataBookingId: bookingIdFromMeta ?? null,
        resolvedBookingId: bookingId,
      });

      console.log(`[API_STRIPE_WEBHOOK] Payment succeeded for Booking: ${bookingId}. Updating database...`);

      try {
        const existing = await db.query.bookings.findFirst({
          where: eq(bookings.id, bookingId),
          columns: {
            id: true,
            status: true,
            userId: true,
            priceAtBooking: true,
            providerId: true,
            serviceId: true,
            paymentIntentId: true,
          },
          with: {
            provider: { columns: { chargesGst: true } },
            service: { columns: { chargesGst: true } },
          },
        });

        if (!existing) {
          console.warn(`[API_STRIPE_WEBHOOK] Booking not found for ${bookingId}`);
          return new NextResponse("Booking not found", { status: 200 });
        }

        const current = existing.status as BookingStatus;
        const alreadyPaid = ["paid", "completed", "refunded", "disputed"].includes(current);

        if (!alreadyPaid) {
          assertTransition(current, "paid");
          const updated = await db
            .update(bookings)
            .set({
              status: "paid",
              paymentIntentId: paymentIntent.id,
              updatedAt: new Date(),
            })
            .where(eq(bookings.id, bookingId))
            .returning({ id: bookings.id, status: bookings.status, paymentIntentId: bookings.paymentIntentId });

          console.info("[API_STRIPE_WEBHOOK] Booking updated", {
            bookingId,
            updatedCount: updated.length,
            updated,
          });
        } else if (existing.paymentIntentId !== paymentIntent.id) {
          // Idempotency / recovery: ensure booking is linked to the PI we received.
          const updated = await db
            .update(bookings)
            .set({
              paymentIntentId: paymentIntent.id,
              updatedAt: new Date(),
            })
            .where(eq(bookings.id, bookingId))
            .returning({ id: bookings.id, status: bookings.status, paymentIntentId: bookings.paymentIntentId });

          console.info("[API_STRIPE_WEBHOOK] Booking linked to PI", {
            bookingId,
            updatedCount: updated.length,
            updated,
          });
        }

        // Compute earnings deterministically using stored price and GST settings
        const chargesGst = existing.service?.chargesGst ?? existing.provider?.chargesGst ?? true;
        const platformFeeBps = Number.parseInt(
          paymentIntent.metadata?.platform_fee_bps || process.env.PLATFORM_FEE_BPS || "1000",
          10,
        );

        const breakdown = calculateEarnings({
          amountInCents: existing.priceAtBooking,
          chargesGst,
          platformFeeBps: Number.isFinite(platformFeeBps) ? platformFeeBps : undefined,
        });

        const piWithCharges = paymentIntent as Stripe.PaymentIntent & {
          charges?: { data?: Array<{ balance_transaction?: string | Stripe.BalanceTransaction }> };
        };

        const balanceTxId = typeof piWithCharges.charges?.data?.[0]?.balance_transaction === "string"
          ? (piWithCharges.charges.data[0].balance_transaction as string)
          : undefined;

        // Do not overwrite refunded earnings back to awaiting_payout.
        if (current !== "refunded") {
          await db
            .insert(providerEarnings)
            .values({
              id: `earn_${bookingId}`,
              bookingId,
              providerId: existing.providerId,
              serviceId: existing.serviceId,
              grossAmount: breakdown.grossAmount,
              platformFeeAmount: breakdown.platformFeeAmount,
              gstAmount: breakdown.gstAmount,
              netAmount: breakdown.netAmount,
              status: "awaiting_payout",
              stripeBalanceTransactionId: balanceTxId,
              paidAt: new Date(paymentIntent.created * 1000),
            })
            .onConflictDoUpdate({
              target: providerEarnings.bookingId,
              set: {
                platformFeeAmount: breakdown.platformFeeAmount,
                gstAmount: breakdown.gstAmount,
                netAmount: breakdown.netAmount,
                status: "awaiting_payout",
                stripeBalanceTransactionId: balanceTxId,
                paidAt: new Date(paymentIntent.created * 1000),
                updatedAt: new Date(),
              },
            });
        }

        console.log(`[API_STRIPE_WEBHOOK] Booking ${bookingId} successfully marked as 'paid' and earnings recorded.`);

        // Provider notification (best-effort): let provider know the booking was paid.
        try {
          const booking = await loadBooking(bookingId);
          if (booking?.provider?.userId) {
            await createNotificationOnce({
              event: `stripe:payment_intent.succeeded:${paymentIntent.id}`,
              bookingId,
              userId: booking.provider.userId,
              ttlSeconds: 60 * 60 * 24,
              payload: {
                type: "payment",
                title: "Booking paid",
                body: `${booking.service?.title ?? "A booking"} has been paid. Earnings are now awaiting payout.`,
                actionUrl: `/dashboard/provider/bookings/${bookingId}`,
                bookingId,
                providerId: booking.providerId,
                serviceId: booking.serviceId,
              },
            });
          }
        } catch (notifyError) {
          console.warn("[API_STRIPE_WEBHOOK] Provider paid notification failed", notifyError);
        }
      } catch (dbError) {
        console.error(`[API_STRIPE_WEBHOOK] DB Error updating booking ${bookingId}:`, dbError);
        // Return 500 to Stripe so it retries this webhook
        return new NextResponse("Database update failed", { status: 500 });
      }

      break;

    case "payment_intent.payment_failed": {
      const paymentFailedIntent = event.data.object as Stripe.PaymentIntent;
      console.log(
        `[API_STRIPE_WEBHOOK] Payment failed: ${paymentFailedIntent.id}`,
        paymentFailedIntent.last_payment_error?.message,
      );

      // Notify provider and customer, clear unusable PI so they can retry
      try {
        const bookingIdMeta = paymentFailedIntent.metadata?.bookingId;
        const customerId = paymentFailedIntent.metadata?.userId;
        if (bookingIdMeta) {
          const booking = await loadBooking(bookingIdMeta);

          if (booking) {
            await db
              .update(bookings)
              .set({
                paymentIntentId: null,
                updatedAt: new Date(),
              })
              .where(eq(bookings.id, bookingIdMeta));

            if (customerId) {
              await notifyCustomer(
                customerId,
                bookingIdMeta,
                "Payment failed",
                `Your payment for ${booking.service?.title ?? "your booking"} failed. Please try another payment method.`,
              );

              const client = await clerkClient();
              const customerUser = await client.users.getUser(customerId);
              const email = customerUser.emailAddresses[0]?.emailAddress;
              if (email) {
                await sendEmail({
                  to: email,
                  subject: `Payment failed for booking ${bookingIdMeta}`,
                  html: `<p>Your payment for ${booking.service?.title ?? "your booking"} failed.</p><p>Please retry payment from your dashboard.</p>`,
                });
              }
            }

            if (booking.provider?.userId) {
              await createNotificationOnce({
                event: `stripe:payment_intent.payment_failed:${paymentFailedIntent.id}`,
                bookingId: booking.id,
                userId: booking.provider.userId,
                ttlSeconds: 60 * 60 * 24,
                payload: {
                  type: "payment",
                  title: "Payment failed",
                  body: `Payment failed for booking ${booking.id}. The customer can retry payment from their dashboard.`,
                  actionUrl: `/dashboard/provider/bookings/${booking.id}`,
                  bookingId: booking.id,
                  providerId: booking.providerId,
                  serviceId: booking.serviceId,
                },
              });
            }
          }
        }
      } catch (notifyError) {
        console.error("[API_STRIPE_WEBHOOK] Failed to handle payment failure", notifyError);
      }
      break;
    }

    case "payment_intent.canceled": {
      const canceledPi = event.data.object as Stripe.PaymentIntent;
      const bookingIdMeta = canceledPi.metadata?.bookingId;
      const customerId = canceledPi.metadata?.userId;

      if (bookingIdMeta) {
        try {
          await db
            .update(bookings)
            .set({ paymentIntentId: null, updatedAt: new Date() })
            .where(eq(bookings.id, bookingIdMeta));

          if (customerId) {
            await notifyCustomer(
              customerId,
              bookingIdMeta,
              "Payment expired",
              "Your payment session expired. Please retry checkout to confirm your booking.",
            );
          }
        } catch (err) {
          console.error("[API_STRIPE_WEBHOOK] Failed to handle canceled PI", err);
        }
      }

      break;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (piId) {
        const pi = await stripe.paymentIntents.retrieve(piId);
        const bookingIdMeta = pi.metadata?.bookingId;
        // A fully refunded charge implies refund completion for this booking.
        if (bookingIdMeta) {
          await db.update(refunds)
            .set({ status: "completed", processedAt: new Date(), updatedAt: new Date() })
            .where(eq(refunds.bookingId, bookingIdMeta));
        }
        if (bookingIdMeta) {
          const result = await markRefunded(bookingIdMeta);
          if (result) return result;
        }
      }
      break;
    }

    case "refund.updated": {
      const refund = event.data.object as Stripe.Refund;
      const piId = refund.payment_intent as string | null;
      let bookingIdMeta: string | null = refund.metadata?.bookingId ?? null;

      if (!bookingIdMeta && piId) {
        const pi = await stripe.paymentIntents.retrieve(piId);
        bookingIdMeta = pi.metadata?.bookingId ?? null;
      }

      await syncRefundRecord(refund, bookingIdMeta);

      if (bookingIdMeta && refund.status === "succeeded") {
        const result = await markRefunded(bookingIdMeta);
        if (result) return result;
      }
      break;
    }

    default:
      console.log(`[API_STRIPE_WEBHOOK] Unhandled event type: ${event.type}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  return new NextResponse(null, { status: 200 });
}

