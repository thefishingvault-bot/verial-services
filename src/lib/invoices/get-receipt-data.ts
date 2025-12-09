import { and, desc, eq } from "drizzle-orm";

import type Stripe from "stripe";

import { bookingCancellations, bookings, providers } from "@/db/schema";
import { db } from "@/lib/db";
import { calculateBookingTotals, BookingTotals } from "@/lib/invoices/totals";
import { stripe } from "@/lib/stripe";

export type ReceiptData = {
  booking: {
    id: string;
    status: (typeof bookings.$inferSelect)["status"];
    scheduledDate: Date | null;
    priceAtBooking: number;
    paymentIntentId: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  service: {
    id: string;
    title: string;
    category: string;
    chargesGst: boolean;
  };
  provider: {
    id: string;
    businessName: string;
    chargesGst: boolean;
    gstNumber: string | null;
    userId: string | null;
    userEmail: string | null;
    region: string | null;
    suburb: string | null;
  };
  customer: {
    id: string;
    name: string;
    email: string | null;
  };
  payment: {
    intentId: string | null;
    status: string | null;
    amount: number | null;
    currency: string | null;
    refunds: {
      id: string;
      amount: number;
      currency: string;
      status: string;
      createdAt: Date;
    }[];
    refundedAmount: number;
  };
  cancellation: {
    actor: string;
    reason: string | null;
    createdAt: Date;
  } | null;
  totals: BookingTotals;
};

export async function getReceiptData(
  bookingId: string,
  userId: string,
): Promise<{ ok: true; data: ReceiptData } | { ok: false; error: "unauthorized" | "not_found" }> {
  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    columns: {
      id: true,
      status: true,
      userId: true,
      providerId: true,
      serviceId: true,
      priceAtBooking: true,
      scheduledDate: true,
      paymentIntentId: true,
      createdAt: true,
      updatedAt: true,
      region: true,
      suburb: true,
    },
    with: {
      service: {
        columns: { id: true, title: true, category: true, chargesGst: true, region: true, suburb: true },
      },
      provider: {
        columns: {
          id: true,
          businessName: true,
          chargesGst: true,
          gstNumber: true,
          userId: true,
        },
        with: {
          user: { columns: { id: true, email: true } },
        },
      },
      user: {
        columns: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });

  if (!booking) {
    return { ok: false, error: "not_found" };
  }

  const providerRecord = (Array.isArray(booking.provider) ? booking.provider[0] : booking.provider) as any;
  const serviceRecord = (Array.isArray(booking.service) ? booking.service[0] : booking.service) as any;
  const userRecord = (Array.isArray(booking.user) ? booking.user[0] : booking.user) as any;

  const viewerProvider = await db.query.providers.findFirst({
    where: eq(providers.userId, userId),
    columns: { id: true },
  });

  const isCustomer = booking.userId === userId;
  const isProvider = viewerProvider?.id === booking.providerId;

  if (!isCustomer && !isProvider) {
    return { ok: false, error: "unauthorized" };
  }

  const cancellation = await db.query.bookingCancellations.findFirst({
    where: eq(bookingCancellations.bookingId, booking.id),
    orderBy: [desc(bookingCancellations.createdAt)],
    columns: { actor: true, reason: true, createdAt: true },
  });

  let paymentIntent: Stripe.PaymentIntent | null = null;
  if (booking.paymentIntentId) {
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(booking.paymentIntentId, {
        expand: ["charges.data.refunds"],
      });
    } catch (error) {
      console.error("[RECEIPT_PAYMENT_INTENT]", error);
      paymentIntent = null;
    }
  }

  const refunds: ReceiptData["payment"]["refunds"] = [];
  let refundedAmount = 0;

  const charges = (paymentIntent as any)?.charges?.data ?? [];
  for (const charge of charges) {
    for (const refund of charge.refunds?.data ?? []) {
      refundedAmount += refund.amount || 0;
      refunds.push({
        id: refund.id,
        amount: refund.amount,
        currency: refund.currency,
        status: refund.status ?? "unknown",
        createdAt: new Date(refund.created * 1000),
      });
    }
  }

  const totals = calculateBookingTotals({
    priceInCents: booking.priceAtBooking,
    chargesGst: providerRecord?.chargesGst ?? serviceRecord?.chargesGst ?? true,
    refundedAmountInCents: refundedAmount,
  });

  const customerName = [userRecord?.firstName, userRecord?.lastName].filter(Boolean).join(" ") || "Customer";

  const providerUser = (providerRecord as any)?.user;

  return {
    ok: true,
    data: {
      booking: {
        id: booking.id,
        status: booking.status,
        scheduledDate: booking.scheduledDate,
        priceAtBooking: booking.priceAtBooking,
        paymentIntentId: booking.paymentIntentId,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
      },
      service: {
        id: serviceRecord?.id ?? booking.serviceId,
        title: serviceRecord?.title ?? "Service",
        category: serviceRecord?.category ?? "other",
        chargesGst: serviceRecord?.chargesGst ?? providerRecord?.chargesGst ?? true,
      },
      provider: {
        id: providerRecord?.id ?? booking.providerId,
        businessName: providerRecord?.businessName ?? "Provider",
        chargesGst: providerRecord?.chargesGst ?? serviceRecord?.chargesGst ?? true,
        gstNumber: providerRecord?.gstNumber ?? null,
        userId: providerUser?.id ?? null,
        userEmail: providerUser?.email ?? null,
        region: booking.region ?? serviceRecord?.region ?? null,
        suburb: booking.suburb ?? serviceRecord?.suburb ?? null,
      },
      customer: {
        id: userRecord?.id ?? booking.userId,
        name: customerName,
        email: userRecord?.email ?? null,
      },
      payment: {
        intentId: paymentIntent?.id ?? booking.paymentIntentId ?? null,
        status: paymentIntent?.status ?? null,
        amount: paymentIntent?.amount ?? booking.priceAtBooking ?? null,
        currency: (paymentIntent?.currency ?? "nzd").toUpperCase(),
        refunds,
        refundedAmount,
      },
      cancellation: cancellation ?? null,
      totals,
    },
  };
}
