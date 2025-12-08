-- Messaging 2.0 structure changes
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Add delivery metadata and attachment storage
ALTER TABLE "messages" ADD COLUMN "server_message_id" uuid;
ALTER TABLE "messages" ADD COLUMN "client_temp_id" varchar(255);
ALTER TABLE "messages" ADD COLUMN "delivered_at" timestamp;
ALTER TABLE "messages" ADD COLUMN "seen_at" timestamp;
ALTER TABLE "messages" ADD COLUMN "attachments" jsonb;

-- Backfill server_message_id then enforce not null and new primary key
UPDATE "messages" SET "server_message_id" = gen_random_uuid() WHERE "server_message_id" IS NULL;
ALTER TABLE "messages" ALTER COLUMN "server_message_id" SET NOT NULL;

-- Preserve legacy id uniqueness, move primary key to server_message_id
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_pkey";
ALTER TABLE "messages" ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("server_message_id");
ALTER TABLE "messages" ADD CONSTRAINT "messages_id_unique" UNIQUE ("id");

-- Index for pagination within booking threads
CREATE INDEX IF NOT EXISTS "messages_booking_created_idx" ON "messages" ("booking_id", "created_at");

-- Cached unread count on threads
ALTER TABLE "message_threads" ADD COLUMN IF NOT EXISTS "unread_count" integer NOT NULL DEFAULT 0;
