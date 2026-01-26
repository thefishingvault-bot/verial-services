CREATE TYPE "waitlist_role" AS ENUM ('provider', 'customer');

CREATE TABLE IF NOT EXISTS "waitlist_signups" (
  "id" varchar(255) PRIMARY KEY,
  "created_at" timestamp NOT NULL DEFAULT now(),

  "role" "waitlist_role" NOT NULL,

  "email" varchar(255) NOT NULL,
  "email_lower" varchar(255) NOT NULL,

  "suburb_city" varchar(255) NOT NULL,
  "suburb_city_norm" varchar(255) NOT NULL,

  "category_text" varchar(255),
  "category_norm" varchar(255),
  "years_experience" integer,

  "referral_code" varchar(32) NOT NULL,
  "referred_by_id" varchar(255) REFERENCES "waitlist_signups"("id") ON DELETE SET NULL,

  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,

  "last_confirmation_email_sent_at" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_signups_email_lower_unique" ON "waitlist_signups" ("email_lower");
CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_signups_referral_code_unique" ON "waitlist_signups" ("referral_code");

CREATE INDEX IF NOT EXISTS "waitlist_signups_email_lower_idx" ON "waitlist_signups" ("email_lower");
CREATE INDEX IF NOT EXISTS "waitlist_signups_referral_code_idx" ON "waitlist_signups" ("referral_code");
CREATE INDEX IF NOT EXISTS "waitlist_signups_referred_by_id_idx" ON "waitlist_signups" ("referred_by_id");
CREATE INDEX IF NOT EXISTS "waitlist_signups_role_idx" ON "waitlist_signups" ("role");
CREATE INDEX IF NOT EXISTS "waitlist_signups_created_at_idx" ON "waitlist_signups" ("created_at");
CREATE INDEX IF NOT EXISTS "waitlist_signups_category_norm_idx" ON "waitlist_signups" ("category_norm");
CREATE INDEX IF NOT EXISTS "waitlist_signups_suburb_city_norm_idx" ON "waitlist_signups" ("suburb_city_norm");
