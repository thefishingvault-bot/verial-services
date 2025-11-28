CREATE TABLE "message_templates" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"category" varchar(50) NOT NULL,
	"variables" text[],
	"created_by" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_communications" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"provider_id" varchar(255) NOT NULL,
	"type" varchar(20) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"status" varchar(20) DEFAULT 'sent' NOT NULL,
	"sent_by" varchar(255) NOT NULL,
	"error" text,
	"response" text,
	"response_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "scheduled_communications" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"subject" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"type" varchar(20) NOT NULL,
	"provider_ids" text[] NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"template_id" varchar(255),
	"created_by" varchar(255) NOT NULL,
	"sent_at" timestamp,
	"status" varchar(20) DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_communications" ADD CONSTRAINT "provider_communications_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_communications" ADD CONSTRAINT "provider_communications_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_communications" ADD CONSTRAINT "scheduled_communications_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_communications" ADD CONSTRAINT "scheduled_communications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;