ALTER TABLE "providers" 
  ADD COLUMN "base_suburb" varchar(255),
  ADD COLUMN "base_region" varchar(255),
  ADD COLUMN "service_radius_km" integer NOT NULL DEFAULT 10;
