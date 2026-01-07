DO $$ BEGIN
  CREATE TYPE "service_pricing_type" AS ENUM ('fixed', 'from', 'quote');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "services"
  ADD COLUMN IF NOT EXISTS "pricing_type" "service_pricing_type" NOT NULL DEFAULT 'fixed';

ALTER TABLE "services"
  ADD COLUMN IF NOT EXISTS "price_note" text;

ALTER TABLE "services"
  ALTER COLUMN "price_in_cents" DROP NOT NULL;

-- Ensure existing rows are consistent
UPDATE "services" SET "pricing_type" = 'fixed' WHERE "pricing_type" IS NULL;

ALTER TABLE "services" DROP CONSTRAINT IF EXISTS services_pricing_type_price_check;
ALTER TABLE "services" ADD CONSTRAINT services_pricing_type_price_check CHECK (
  (pricing_type = 'quote' AND price_in_cents IS NULL)
  OR
  (pricing_type IN ('fixed','from') AND price_in_cents IS NOT NULL AND price_in_cents > 0)
);
