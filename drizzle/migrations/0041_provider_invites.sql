CREATE TYPE "public"."provider_invite_status" AS ENUM('pending', 'redeemed', 'revoked');--> statement-breakpoint

CREATE TABLE "provider_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(255) NOT NULL,
  "email_lower" varchar(255) NOT NULL,
  "token" varchar(255) NOT NULL,
  "status" "provider_invite_status" DEFAULT 'pending' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "created_by_user_id" varchar(255) NOT NULL,
  "redeemed_at" timestamp,
  "redeemed_by_user_id" varchar(255),
  "notes" text
);
--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN "early_provider_access" boolean DEFAULT false NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX "provider_invites_token_unique" ON "provider_invites" USING btree ("token");--> statement-breakpoint
CREATE INDEX "provider_invites_email_lower_idx" ON "provider_invites" USING btree ("email_lower");--> statement-breakpoint
CREATE INDEX "provider_invites_status_idx" ON "provider_invites" USING btree ("status");--> statement-breakpoint
CREATE INDEX "provider_invites_created_at_idx" ON "provider_invites" USING btree ("created_at");
