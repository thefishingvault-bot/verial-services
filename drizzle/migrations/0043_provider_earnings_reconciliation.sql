ALTER TABLE "provider_earnings" ADD COLUMN "customer_service_fee_amount" integer DEFAULT 0 NOT NULL;
ALTER TABLE "provider_earnings" ADD COLUMN "customer_total_charged_amount" integer;
ALTER TABLE "provider_earnings" ADD COLUMN "stripe_charge_id" varchar(255);
ALTER TABLE "provider_earnings" ADD COLUMN "stripe_fee_amount" integer;
ALTER TABLE "provider_earnings" ADD COLUMN "stripe_net_amount" integer;
ALTER TABLE "provider_earnings" ADD COLUMN "stripe_amount" integer;
