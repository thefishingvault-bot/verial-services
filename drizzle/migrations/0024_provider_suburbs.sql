CREATE TABLE "provider_suburbs" (
    "provider_id" varchar(255) NOT NULL,
    "region" varchar(100) NOT NULL,
    "suburb" varchar(100) NOT NULL,
    CONSTRAINT "provider_suburbs_provider_id_suburb_pk" PRIMARY KEY ("provider_id", "suburb")
);
--> statement-breakpoint
ALTER TABLE "provider_suburbs" ADD CONSTRAINT "provider_suburbs_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_suburbs_region_idx" ON "provider_suburbs" ("region");
