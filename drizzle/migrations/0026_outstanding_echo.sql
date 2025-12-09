CREATE TABLE "booking_cancellations" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"booking_id" varchar(255) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"actor" varchar(20) NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_reschedules" (
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
CREATE TABLE "message_threads" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"booking_id" varchar(255) NOT NULL,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "message_threads_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE "provider_suburbs" (
	"provider_id" varchar(255) NOT NULL,
	"region" varchar(100) NOT NULL,
	"suburb" varchar(100) NOT NULL,
	CONSTRAINT "provider_suburbs_provider_id_suburb_pk" PRIMARY KEY("provider_id","suburb")
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_provider_id_unique";--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_user1_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_user2_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_conversation_id_conversations_id_fk";
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
ALTER TABLE "bookings" ADD COLUMN "region" varchar(255);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "suburb" varchar(255);--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "user_a_id" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "user_b_id" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "server_message_id" varchar(255) PRIMARY KEY NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "booking_id" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "thread_id" varchar(255);--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "recipient_id" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "is_system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "attachments" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "client_temp_id" varchar(255);--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "delivered_at" timestamp;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "seen_at" timestamp;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "read_at" timestamp;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "type" varchar(50) DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "title" text DEFAULT 'Notification' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "body" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "action_url" text DEFAULT '/dashboard' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "read_at" timestamp;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "booking_id" varchar(255);--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "service_id" varchar(255);--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "provider_id" varchar(255);--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "gst_number" varchar(50);--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "service_id" varchar(255);--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "tip_amount" integer;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "is_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "hidden_reason" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "hidden_by" varchar(255);--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "hidden_at" timestamp;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "region" varchar(255);--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "suburb" varchar(255);--> statement-breakpoint
ALTER TABLE "booking_cancellations" ADD CONSTRAINT "booking_cancellations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_cancellations" ADD CONSTRAINT "booking_cancellations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_reschedules" ADD CONSTRAINT "booking_reschedules_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_reschedules" ADD CONSTRAINT "booking_reschedules_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_reschedules" ADD CONSTRAINT "booking_reschedules_responder_id_users_id_fk" FOREIGN KEY ("responder_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_suburbs" ADD CONSTRAINT "provider_suburbs_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_threads_booking_idx" ON "message_threads" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "message_threads_last_message_idx" ON "message_threads" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "provider_suburbs_region_idx" ON "provider_suburbs" USING btree ("region");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_a_id_users_id_fk" FOREIGN KEY ("user_a_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_b_id_users_id_fk" FOREIGN KEY ("user_b_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hidden_by_users_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_user_pair_unique" ON "conversations" USING btree ("user_a_id","user_b_id");--> statement-breakpoint
CREATE INDEX "conversations_last_message_idx" ON "conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "messages_booking_idx" ON "messages" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "messages_sender_created_idx" ON "messages" USING btree ("sender_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_unread_idx" ON "messages" USING btree ("recipient_id","read_at");--> statement-breakpoint
CREATE INDEX "messages_thread_created_idx" ON "messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_booking_created_idx" ON "messages" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN "user1_id";--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN "user2_id";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "conversation_id";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "is_read";--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_id_unique" UNIQUE("id");