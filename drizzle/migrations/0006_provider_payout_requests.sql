CREATE TYPE "provider_payout_request_status" AS ENUM ('queued', 'processed', 'failed');

CREATE TABLE IF NOT EXISTS "provider_payout_requests" (
  "id" varchar(255) PRIMARY KEY,
  "provider_id" varchar(255) NOT NULL REFERENCES "providers"("id") ON DELETE CASCADE,

  "amount" integer NOT NULL,
  "currency" varchar(10) NOT NULL DEFAULT 'nzd',
  "status" "provider_payout_request_status" NOT NULL DEFAULT 'queued',

  "idempotency_key" varchar(255) NOT NULL,

  "payouts_disabled" boolean NOT NULL DEFAULT false,
  "note" text,

  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "provider_payout_requests_provider_idx" ON "provider_payout_requests" ("provider_id");
CREATE UNIQUE INDEX IF NOT EXISTS "provider_payout_requests_provider_idempotency_unique" ON "provider_payout_requests" ("provider_id", "idempotency_key");
