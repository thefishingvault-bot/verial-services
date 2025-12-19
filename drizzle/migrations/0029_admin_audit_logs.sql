CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"action" varchar(100) NOT NULL,
	"resource" varchar(50) NOT NULL,
	"resource_id" varchar(255),
	"details" text NOT NULL,
	"ip_address" varchar(100) DEFAULT 'unknown' NOT NULL,
	"user_agent" text DEFAULT 'unknown' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "admin_audit_logs_created_at_idx" ON "admin_audit_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_action_idx" ON "admin_audit_logs" ("action");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_resource_idx" ON "admin_audit_logs" ("resource");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_user_id_idx" ON "admin_audit_logs" ("user_id");
