DO $$ BEGIN
  CREATE TYPE "job_request_status" AS ENUM ('open', 'assigned', 'in_progress', 'completed', 'closed', 'cancelled', 'expired');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "quote_status" AS ENUM ('submitted', 'accepted', 'rejected', 'withdrawn');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "payment_status" AS ENUM ('pending', 'deposit_paid', 'fully_paid', 'refunded', 'partially_refunded', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "job_payment_type" AS ENUM ('deposit', 'remainder', 'full');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "job_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_user_id" varchar(255) NOT NULL,
  "assigned_provider_id" varchar(255),
  "title" varchar(255) NOT NULL,
  "description" text,
  "region" varchar(255),
  "suburb" varchar(255),
  "status" "job_request_status" DEFAULT 'open' NOT NULL,
  "accepted_quote_id" uuid,
  "total_price" integer,
  "deposit_amount" integer,
  "remaining_amount" integer,
  "payment_status" "payment_status" DEFAULT 'pending' NOT NULL,
  "lifecycle_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "job_requests" ADD CONSTRAINT "job_requests_customer_user_id_users_id_fk"
    FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "job_requests" ADD CONSTRAINT "job_requests_assigned_provider_id_users_id_fk"
    FOREIGN KEY ("assigned_provider_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "job_quotes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_request_id" uuid NOT NULL,
  "provider_id" varchar(255) NOT NULL,
  "amount_total" integer NOT NULL,
  "availability" text,
  "included" text,
  "excluded" text,
  "response_speed_hours" integer,
  "status" "quote_status" DEFAULT 'submitted' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "job_quotes_job_request_provider_unique" UNIQUE("job_request_id","provider_id")
);

DO $$ BEGIN
  ALTER TABLE "job_quotes" ADD CONSTRAINT "job_quotes_job_request_id_job_requests_id_fk"
    FOREIGN KEY ("job_request_id") REFERENCES "public"."job_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "job_quotes" ADD CONSTRAINT "job_quotes_provider_id_providers_id_fk"
    FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "job_requests" ADD CONSTRAINT "job_requests_accepted_quote_id_job_quotes_id_fk"
    FOREIGN KEY ("accepted_quote_id") REFERENCES "public"."job_quotes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "job_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_request_id" uuid NOT NULL,
  "quote_id" uuid NOT NULL,
  "stripe_payment_intent_id" varchar(255) NOT NULL,
  "payment_type" "job_payment_type" NOT NULL,
  "amount_total" integer NOT NULL,
  "platform_fee_amount" integer NOT NULL,
  "provider_amount" integer NOT NULL,
  "payment_status" "payment_status" DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "job_payments_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id")
);

DO $$ BEGIN
  ALTER TABLE "job_payments" ADD CONSTRAINT "job_payments_job_request_id_job_requests_id_fk"
    FOREIGN KEY ("job_request_id") REFERENCES "public"."job_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "job_payments" ADD CONSTRAINT "job_payments_quote_id_job_quotes_id_fk"
    FOREIGN KEY ("quote_id") REFERENCES "public"."job_quotes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "job_requests_customer_idx" ON "job_requests" ("customer_user_id");
CREATE INDEX IF NOT EXISTS "job_requests_assigned_provider_idx" ON "job_requests" ("assigned_provider_id");
CREATE INDEX IF NOT EXISTS "job_requests_status_idx" ON "job_requests" ("status");
CREATE INDEX IF NOT EXISTS "job_requests_accepted_quote_idx" ON "job_requests" ("accepted_quote_id");
CREATE INDEX IF NOT EXISTS "job_requests_payment_status_idx" ON "job_requests" ("payment_status");

CREATE INDEX IF NOT EXISTS "job_quotes_job_request_idx" ON "job_quotes" ("job_request_id");
CREATE INDEX IF NOT EXISTS "job_quotes_provider_idx" ON "job_quotes" ("provider_id");
CREATE INDEX IF NOT EXISTS "job_quotes_status_idx" ON "job_quotes" ("status");

CREATE INDEX IF NOT EXISTS "job_payments_job_request_idx" ON "job_payments" ("job_request_id");
CREATE INDEX IF NOT EXISTS "job_payments_quote_idx" ON "job_payments" ("quote_id");
CREATE INDEX IF NOT EXISTS "job_payments_status_idx" ON "job_payments" ("payment_status");
