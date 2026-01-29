ALTER TABLE "providers" 
  ADD COLUMN IF NOT EXISTS "base_suburb" varchar(255),
  ADD COLUMN IF NOT EXISTS "base_region" varchar(255),
  ADD COLUMN IF NOT EXISTS "service_radius_km" integer NOT NULL DEFAULT 10;
