ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "type" varchar(50) NOT NULL DEFAULT 'system';
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "title" text;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "body" text;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "action_url" text NOT NULL DEFAULT '/dashboard';
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "read_at" timestamp;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "booking_id" varchar(255) REFERENCES "bookings"("id") ON DELETE SET NULL;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "service_id" varchar(255) REFERENCES "services"("id") ON DELETE SET NULL;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "provider_id" varchar(255) REFERENCES "providers"("id") ON DELETE SET NULL;

UPDATE "notifications" SET "title" = COALESCE("title", "message") WHERE "title" IS NULL;
ALTER TABLE "notifications" ALTER COLUMN "title" SET DEFAULT 'Notification';
ALTER TABLE "notifications" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "notifications" ALTER COLUMN "href" SET DEFAULT '/dashboard';
ALTER TABLE "notifications" ALTER COLUMN "message" SET DEFAULT 'Notification';

CREATE INDEX IF NOT EXISTS "notifications_user_idx" ON "notifications" ("user_id");
CREATE INDEX IF NOT EXISTS "notifications_created_idx" ON "notifications" ("created_at");
