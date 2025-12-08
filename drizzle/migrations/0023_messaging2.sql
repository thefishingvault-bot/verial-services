CREATE TABLE IF NOT EXISTS "message_threads" (
    "id" varchar(255) PRIMARY KEY NOT NULL,
    "booking_id" varchar(255) NOT NULL UNIQUE,
    "last_message_at" timestamp DEFAULT now() NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_threads_booking_idx" ON "message_threads" ("booking_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_threads_last_message_idx" ON "message_threads" ("last_message_at");
--> statement-breakpoint
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "booking_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "thread_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "recipient_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "is_system" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "attachments" text;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "deleted_at" timestamp;
--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "conversation_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_booking_idx" ON "messages" ("booking_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_sender_created_idx" ON "messages" ("sender_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_unread_idx" ON "messages" ("recipient_id","read_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_thread_created_idx" ON "messages" ("thread_id","created_at");
