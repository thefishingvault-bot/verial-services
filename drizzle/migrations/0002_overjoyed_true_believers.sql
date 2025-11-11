ALTER TABLE "providers" ADD COLUMN "charges_gst" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "charges_gst" boolean DEFAULT true NOT NULL;