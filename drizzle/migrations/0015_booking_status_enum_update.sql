ALTER TABLE "bookings" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "status" SET DEFAULT 'pending'::text;--> statement-breakpoint

-- Map legacy statuses to the new enum values before recreating the type
UPDATE "bookings" SET "status" = 'accepted' WHERE "status" = 'confirmed';--> statement-breakpoint
UPDATE "bookings" SET "status" = 'canceled_customer' WHERE "status" = 'canceled';--> statement-breakpoint

DROP TYPE "public"."booking_status";--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending', 'accepted', 'declined', 'paid', 'completed', 'canceled_customer', 'canceled_provider', 'disputed', 'refunded');--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."booking_status";--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "status" SET DATA TYPE "public"."booking_status" USING "status"::"public"."booking_status";