CREATE TABLE IF NOT EXISTS "booking_cancellations" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"booking_id" varchar(255) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"actor" varchar(20) NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "booking_reschedules" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"booking_id" varchar(255) NOT NULL,
	"requester_id" varchar(255) NOT NULL,
	"proposed_date" timestamp NOT NULL,
	"responder_id" varchar(255),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"provider_note" text,
	"customer_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_threads" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"booking_id" varchar(255) NOT NULL,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "message_threads_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_suburbs" (
	"provider_id" varchar(255) NOT NULL,
	"region" varchar(100) NOT NULL,
	"suburb" varchar(100) NOT NULL,
	CONSTRAINT "provider_suburbs_provider_id_suburb_pk" PRIMARY KEY("provider_id","suburb")
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_provider_id_unique";--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_user1_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_user2_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_conversation_id_conversations_id_fk";
--> statement-breakpoint
/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'public'
                AND table_name = 'messages'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

-- ALTER TABLE "messages" DROP CONSTRAINT "<constraint_name>";--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "message" SET DEFAULT 'Notification';--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "href" SET DEFAULT '/dashboard';--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "region" varchar(255);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "suburb" varchar(255);--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "user_a_id" varchar(255);--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "user_b_id" varchar(255);--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "server_message_id" varchar(255);--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "booking_id" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "thread_id" varchar(255);--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "recipient_id" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "is_system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "attachments" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "client_temp_id" varchar(255);--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "delivered_at" timestamp;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "seen_at" timestamp;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "read_at" timestamp;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "type" varchar(50) DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "title" text DEFAULT 'Notification' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "body" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "action_url" text DEFAULT '/dashboard' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "read_at" timestamp;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "booking_id" varchar(255);--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "service_id" varchar(255);--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "provider_id" varchar(255);--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "gst_number" varchar(50);--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "service_id" varchar(255);--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "tip_amount" integer;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "is_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "hidden_reason" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "hidden_by" varchar(255);--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "hidden_at" timestamp;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "region" varchar(255);--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "suburb" varchar(255);--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "booking_cancellations" ADD CONSTRAINT "booking_cancellations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN
		NULL;
END $$;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "booking_cancellations" ADD CONSTRAINT "booking_cancellations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN
		NULL;
END $$;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "booking_reschedules" ADD CONSTRAINT "booking_reschedules_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN
		NULL;
END $$;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "booking_reschedules" ADD CONSTRAINT "booking_reschedules_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN
		NULL;
END $$;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "booking_reschedules" ADD CONSTRAINT "booking_reschedules_responder_id_users_id_fk" FOREIGN KEY ("responder_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN
		NULL;
END $$;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN
		NULL;
END $$;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "provider_suburbs" ADD CONSTRAINT "provider_suburbs_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN
		NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_threads_booking_idx" ON "message_threads" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_threads_last_message_idx" ON "message_threads" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_suburbs_region_idx" ON "provider_suburbs" USING btree ("region");--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_a_id_users_id_fk" FOREIGN KEY ("user_a_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN
		NULL;
END $$;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_b_id_users_id_fk" FOREIGN KEY ("user_b_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN
		NULL;
END $$;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "messages" ADD CONSTRAINT "messages_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN
		NULL;
END $$;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN
		NULL;
END $$;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "messages" ADD CONSTRAINT "messages_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN
		NULL;
END $$;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "notifications" ADD CONSTRAINT "notifications_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN
		NULL;
END $$;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "notifications" ADD CONSTRAINT "notifications_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN
		NULL;
END $$;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "notifications" ADD CONSTRAINT "notifications_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN
		NULL;
END $$;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "reviews" ADD CONSTRAINT "reviews_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN
		NULL;
END $$;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hidden_by_users_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN
		NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_user_pair_unique" ON "conversations" USING btree ("user_a_id","user_b_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_last_message_idx" ON "conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_booking_idx" ON "messages" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_sender_created_idx" ON "messages" USING btree ("sender_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_unread_idx" ON "messages" USING btree ("recipient_id","read_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_thread_created_idx" ON "messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_booking_created_idx" ON "messages" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN IF EXISTS "user1_id";--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN IF EXISTS "user2_id";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN IF EXISTS "conversation_id";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN IF EXISTS "is_read";--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "messages" ADD CONSTRAINT "messages_id_unique" UNIQUE("id");
EXCEPTION
	WHEN duplicate_object OR duplicate_table THEN
		NULL;
END $$;