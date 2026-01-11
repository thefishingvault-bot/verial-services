-- Ensure only one review per booking per customer (reviewer)

-- Previous schema used a unique constraint/index on booking_id alone.
-- We now enforce uniqueness on (booking_id, user_id) to match the API guard.

DO $$
BEGIN
  -- Drop old constraint if it exists (name may vary by migration history)
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reviews_booking_id_unique'
  ) THEN
    ALTER TABLE "reviews" DROP CONSTRAINT "reviews_booking_id_unique";
  END IF;
END $$;

-- Drop old unique index if it exists
DROP INDEX IF EXISTS "reviews_booking_id_unique";

-- Add the composite unique index
CREATE UNIQUE INDEX IF NOT EXISTS "reviews_booking_user_unique" ON "reviews" ("booking_id", "user_id");
