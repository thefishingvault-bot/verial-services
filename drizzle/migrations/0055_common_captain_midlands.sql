ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "categories" text[];--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "primary_category" text;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "custom_category" text;