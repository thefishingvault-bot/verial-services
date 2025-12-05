ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "service_id" varchar(255) REFERENCES "services"("id") ON DELETE SET NULL;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "tip_amount" integer;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "is_hidden" boolean NOT NULL DEFAULT false;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "hidden_reason" text;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "hidden_by" varchar(255) REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "hidden_at" timestamp;

-- Ensure rating stays in 1..5
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reviews_rating_range'
  ) THEN
    ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range" CHECK (rating BETWEEN 1 AND 5);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "reviews_provider_idx" ON "reviews" ("provider_id");
CREATE INDEX IF NOT EXISTS "reviews_service_idx" ON "reviews" ("service_id");
