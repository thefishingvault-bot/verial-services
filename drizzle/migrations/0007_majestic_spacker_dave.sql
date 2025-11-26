CREATE TYPE "public"."provider_change_field" AS ENUM('bio', 'businessName', 'baseSuburb', 'baseRegion', 'serviceRadiusKm');--> statement-breakpoint
CREATE TYPE "public"."provider_change_status" AS ENUM('pending', 'approved', 'rejected', 'flagged');--> statement-breakpoint
CREATE TABLE "favorite_providers" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"provider_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_changes" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"provider_id" varchar(255) NOT NULL,
	"field_name" "provider_change_field" NOT NULL,
	"old_value" text,
	"new_value" text NOT NULL,
	"status" "provider_change_status" DEFAULT 'pending' NOT NULL,
	"requested_by" varchar(255) NOT NULL,
	"reviewed_by" varchar(255),
	"review_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "base_suburb" varchar(255);--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "base_region" varchar(255);--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "service_radius_km" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "favorite_providers" ADD CONSTRAINT "favorite_providers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_providers" ADD CONSTRAINT "favorite_providers_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_changes" ADD CONSTRAINT "provider_changes_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_changes" ADD CONSTRAINT "provider_changes_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_changes" ADD CONSTRAINT "provider_changes_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;