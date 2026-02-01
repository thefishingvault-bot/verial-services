-- Customer profile completion + address fields
-- Adds customer role value, profile completion tracking, and customer address/consent fields.

DO $$
BEGIN
  -- Add enum value if it doesn't already exist
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'customer'
  ) THEN
    ALTER TYPE "user_role" ADD VALUE 'customer';
  END IF;
END $$;

--> statement-breakpoint

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "phone" text,
  ADD COLUMN IF NOT EXISTS "address_line1" text,
  ADD COLUMN IF NOT EXISTS "address_line2" text,
  ADD COLUMN IF NOT EXISTS "suburb" text,
  ADD COLUMN IF NOT EXISTS "city" text,
  ADD COLUMN IF NOT EXISTS "region" text,
  ADD COLUMN IF NOT EXISTS "postcode" text,
  ADD COLUMN IF NOT EXISTS "profile_completed" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "accepted_terms_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "accepted_privacy_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "confirmed_18_plus_at" timestamptz;

-- Enforce that completed profiles have required fields set.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_profile_completed_requires_fields'
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_profile_completed_requires_fields"
      CHECK (
        profile_completed = false
        OR (
          username_lower IS NOT NULL
          AND first_name IS NOT NULL
          AND last_name IS NOT NULL
          AND phone IS NOT NULL
          AND address_line1 IS NOT NULL
          AND suburb IS NOT NULL
          AND city IS NOT NULL
          AND region IS NOT NULL
          AND postcode IS NOT NULL
          AND accepted_terms_at IS NOT NULL
          AND accepted_privacy_at IS NOT NULL
          AND confirmed_18_plus_at IS NOT NULL
        )
      );
  END IF;
END $$;
