ALTER TABLE "provider_payouts" ADD COLUMN "stripe_account_id" varchar(255);
ALTER TABLE "provider_payouts" ADD COLUMN "stripe_created_at" timestamp;
ALTER TABLE "provider_payouts" ADD COLUMN "raw" jsonb;

UPDATE "provider_payouts" p
SET "stripe_account_id" = pr."stripe_connect_id"
FROM "providers" pr
WHERE pr."id" = p."provider_id" AND p."stripe_account_id" IS NULL;

ALTER TABLE "provider_payouts" ALTER COLUMN "stripe_account_id" SET NOT NULL;

CREATE UNIQUE INDEX "provider_payouts_stripe_account_payout_unique" ON "provider_payouts" ("stripe_account_id", "stripe_payout_id");
