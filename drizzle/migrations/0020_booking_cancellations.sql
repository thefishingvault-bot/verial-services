CREATE TABLE "booking_cancellations" (
    "id" varchar(255) PRIMARY KEY NOT NULL,
    "booking_id" varchar(255) NOT NULL,
    "user_id" varchar(255) NOT NULL,
    "actor" varchar(20) NOT NULL,
    "reason" text,
    "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_cancellations" ADD CONSTRAINT "booking_cancellations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "booking_cancellations" ADD CONSTRAINT "booking_cancellations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_cancellations_booking_idx" ON "booking_cancellations" ("booking_id");
