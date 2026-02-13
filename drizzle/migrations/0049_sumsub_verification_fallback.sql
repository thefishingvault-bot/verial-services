DO $$ BEGIN
  CREATE TYPE "verification_status" AS ENUM ('pending', 'verified', 'unavailable', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "providers"
ADD COLUMN IF NOT EXISTS "verification_status" "verification_status" DEFAULT 'pending' NOT NULL;

UPDATE "providers"
SET "verification_status" = CASE
  WHEN "kyc_status" = 'verified' THEN 'verified'::"verification_status"
  WHEN "kyc_status" = 'rejected' THEN 'rejected'::"verification_status"
  ELSE 'pending'::"verification_status"
END
WHERE "verification_status" <> CASE
  WHEN "kyc_status" = 'verified' THEN 'verified'::"verification_status"
  WHEN "kyc_status" = 'rejected' THEN 'rejected'::"verification_status"
  ELSE 'pending'::"verification_status"
END;
