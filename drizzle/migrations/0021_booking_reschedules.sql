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
ALTER TABLE "booking_reschedules" ADD CONSTRAINT "booking_reschedules_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "booking_reschedules" ADD CONSTRAINT "booking_reschedules_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "booking_reschedules" ADD CONSTRAINT "booking_reschedules_responder_id_users_id_fk" FOREIGN KEY ("responder_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_reschedules_booking_idx" ON "booking_reschedules" ("booking_id");
