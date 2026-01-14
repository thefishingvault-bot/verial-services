CREATE TABLE "provider_saved_replies" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"provider_id" varchar(255) NOT NULL,
	"title" varchar(120) NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_saved_replies" ADD CONSTRAINT "provider_saved_replies_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;
