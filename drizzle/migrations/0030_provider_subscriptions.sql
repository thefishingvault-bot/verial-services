-- Provider subscriptions (Stripe Billing)

DO $$ BEGIN
  CREATE TYPE "provider_plan" AS ENUM ('starter', 'pro', 'elite');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "providers"
  ADD COLUMN IF NOT EXISTS "plan" "provider_plan" NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS "stripe_customer_id" varchar(255),
  ADD COLUMN IF NOT EXISTS "stripe_subscription_id" varchar(255),
  ADD COLUMN IF NOT EXISTS "stripe_subscription_status" varchar(50),
  ADD COLUMN IF NOT EXISTS "stripe_subscription_price_id" varchar(255),
  ADD COLUMN IF NOT EXISTS "stripe_current_period_end" timestamp,
  ADD COLUMN IF NOT EXISTS "stripe_cancel_at_period_end" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "stripe_subscription_updated_at" timestamp NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS "providers_stripe_customer_id_unique" ON "providers" ("stripe_customer_id");
CREATE UNIQUE INDEX IF NOT EXISTS "providers_stripe_subscription_id_unique" ON "providers" ("stripe_subscription_id");
CREATE INDEX IF NOT EXISTS "providers_plan_idx" ON "providers" ("plan");
