CREATE TYPE "public"."kyc_status" AS ENUM('not_started', 'in_progress', 'pending_review', 'verified', 'rejected');--> statement-breakpoint
CREATE TABLE "provider_suspensions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"provider_id" varchar(255) NOT NULL,
	"action" varchar(50) NOT NULL,
	"reason" text,
	"start_date" timestamp,
	"end_date" timestamp,
	"performed_by" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "kyc_status" "kyc_status" DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "identity_document_url" text;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "business_document_url" text;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "kyc_submitted_at" timestamp;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "kyc_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "is_suspended" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "suspension_reason" text;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "suspension_start_date" timestamp;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "suspension_end_date" timestamp;--> statement-breakpoint
ALTER TABLE "provider_suspensions" ADD CONSTRAINT "provider_suspensions_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_suspensions" ADD CONSTRAINT "provider_suspensions_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;