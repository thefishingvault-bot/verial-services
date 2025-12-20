import type Stripe from "stripe";

import { stripe } from "@/lib/stripe";

export type PaymentIntentChargeInfo = {
  chargeAmount: number | null;
  applicationFeeAmount: number | null;
  transferAmount: number | null;
  hasTransfer: boolean;
};

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function prorate(portion: number, refundAmount: number, totalAmount: number): number {
  if (!Number.isFinite(portion) || !Number.isFinite(refundAmount) || !Number.isFinite(totalAmount)) return 0;
  if (totalAmount <= 0) return 0;
  return Math.round((portion * refundAmount) / totalAmount);
}

export async function getPaymentIntentChargeInfo(
  paymentIntentId: string,
): Promise<PaymentIntentChargeInfo> {
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

  const latestCharge = pi.latest_charge;
  if (!latestCharge) {
    return {
      chargeAmount: null,
      applicationFeeAmount: null,
      transferAmount: null,
      hasTransfer: false,
    };
  }

  const charge: Stripe.Charge =
    typeof latestCharge === "string"
      ? await stripe.charges.retrieve(latestCharge, { expand: ["transfer"] })
      : (latestCharge as Stripe.Charge);

  const chargeAmount = asNumber(charge.amount);
  const applicationFeeAmount = asNumber(
    (charge as unknown as { application_fee_amount?: unknown }).application_fee_amount,
  );

  const transfer = (charge as unknown as { transfer?: unknown }).transfer;
  const hasTransfer = !!transfer;

  let transferAmount: number | null = null;
  if (transfer && typeof transfer === "object") {
    transferAmount = asNumber((transfer as { amount?: unknown }).amount);
  }

  return {
    chargeAmount,
    applicationFeeAmount,
    transferAmount,
    hasTransfer,
  };
}

export type CreateMarketplaceRefundArgs = {
  paymentIntentId: string;
  amount: number;
  reason?: Stripe.RefundCreateParams.Reason;
  metadata?: Stripe.MetadataParam;
  idempotencyKey?: string;
};

export type MarketplaceRefundResult = {
  refund: Stripe.Response<Stripe.Refund>;
  chargeInfo: PaymentIntentChargeInfo;
  refundedPlatformFee: number | null;
  refundedProviderAmount: number | null;
};

/**
 * Creates a refund that matches Connect destination-charge semantics.
 *
 * - If the underlying charge has a Connect transfer, we set `reverse_transfer: true`.
 * - If the underlying charge has an application fee, we set `refund_application_fee: true`.
 *
 * Returns best-effort prorated fee breakdown based on the original charge.
 */
export async function createMarketplaceRefund(
  args: CreateMarketplaceRefundArgs,
): Promise<MarketplaceRefundResult> {
  const chargeInfo = await getPaymentIntentChargeInfo(args.paymentIntentId);

  const reverseTransfer = chargeInfo.hasTransfer ? true : undefined;
  const refundApplicationFee =
    chargeInfo.applicationFeeAmount != null && chargeInfo.applicationFeeAmount > 0 ? true : undefined;

  const refund = await stripe.refunds.create(
    {
      payment_intent: args.paymentIntentId,
      amount: args.amount,
      reason: args.reason ?? "requested_by_customer",
      metadata: args.metadata,
      ...(reverseTransfer ? { reverse_transfer: true } : null),
      ...(refundApplicationFee ? { refund_application_fee: true } : null),
    },
    args.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : undefined,
  );

  const chargeAmount = chargeInfo.chargeAmount;
  const refundedPlatformFee =
    chargeAmount && chargeInfo.applicationFeeAmount != null
      ? prorate(chargeInfo.applicationFeeAmount, args.amount, chargeAmount)
      : null;

  const refundedProviderAmount =
    refundedPlatformFee != null
      ? Math.max(0, args.amount - refundedPlatformFee)
      : chargeAmount && chargeInfo.transferAmount != null
        ? prorate(chargeInfo.transferAmount, args.amount, chargeAmount)
        : null;

  return {
    refund,
    chargeInfo,
    refundedPlatformFee,
    refundedProviderAmount,
  };
}
