ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "provider_message" text;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "provider_quoted_price" integer;
