ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "is_published" boolean;
ALTER TABLE "services" ALTER COLUMN "is_published" SET DEFAULT false;
UPDATE "services" SET "is_published" = COALESCE("is_published", false);
ALTER TABLE "services" ALTER COLUMN "is_published" SET NOT NULL;