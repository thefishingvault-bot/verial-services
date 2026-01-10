-- Booking lifecycle: provider-completed stage before customer confirmation
ALTER TYPE "public"."booking_status" ADD VALUE IF NOT EXISTS 'completed_by_provider';

-- Earnings lifecycle: platform-hold and transfer stages
ALTER TYPE "public"."earning_status" ADD VALUE IF NOT EXISTS 'held';
ALTER TYPE "public"."earning_status" ADD VALUE IF NOT EXISTS 'transferred';

-- Provider earnings: store Stripe ids for reconciliation
ALTER TABLE "provider_earnings" ADD COLUMN IF NOT EXISTS "stripe_payment_intent_id" varchar(255);
ALTER TABLE "provider_earnings" ADD COLUMN IF NOT EXISTS "stripe_transfer_id" varchar(255);
ALTER TABLE "provider_earnings" ADD COLUMN IF NOT EXISTS "transferred_at" timestamp;
