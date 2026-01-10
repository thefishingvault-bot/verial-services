DO $$
BEGIN
  CREATE TYPE "booking_payout_status" AS ENUM ('unpaid', 'paid_out');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "payout_status" "booking_payout_status" NOT NULL DEFAULT 'unpaid';

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "paid_out_at" timestamp;
  ADD COLUMN IF NOT EXISTS "paid_out_at" timestamp;
