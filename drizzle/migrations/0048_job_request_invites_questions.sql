DO $$ BEGIN
  CREATE TYPE "job_invite_status" AS ENUM ('pending', 'accepted', 'declined', 'revoked');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "job_request_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_request_id" uuid NOT NULL,
  "provider_id" varchar(255) NOT NULL,
  "invited_by_user_id" varchar(255) NOT NULL,
  "status" "job_invite_status" DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "job_request_invites_job_request_provider_unique" UNIQUE("job_request_id","provider_id")
);

DO $$ BEGIN
  ALTER TABLE "job_request_invites" ADD CONSTRAINT "job_request_invites_job_request_id_job_requests_id_fk"
    FOREIGN KEY ("job_request_id") REFERENCES "public"."job_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "job_request_invites" ADD CONSTRAINT "job_request_invites_provider_id_providers_id_fk"
    FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "job_request_invites" ADD CONSTRAINT "job_request_invites_invited_by_user_id_users_id_fk"
    FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "job_request_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_request_id" uuid NOT NULL,
  "asked_by_user_id" varchar(255) NOT NULL,
  "question" text NOT NULL,
  "answer" text,
  "answered_by_user_id" varchar(255),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "job_request_questions" ADD CONSTRAINT "job_request_questions_job_request_id_job_requests_id_fk"
    FOREIGN KEY ("job_request_id") REFERENCES "public"."job_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "job_request_questions" ADD CONSTRAINT "job_request_questions_asked_by_user_id_users_id_fk"
    FOREIGN KEY ("asked_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "job_request_questions" ADD CONSTRAINT "job_request_questions_answered_by_user_id_users_id_fk"
    FOREIGN KEY ("answered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "job_request_invites_job_request_idx" ON "job_request_invites" ("job_request_id");
CREATE INDEX IF NOT EXISTS "job_request_invites_provider_idx" ON "job_request_invites" ("provider_id");
CREATE INDEX IF NOT EXISTS "job_request_invites_status_idx" ON "job_request_invites" ("status");

CREATE INDEX IF NOT EXISTS "job_request_questions_job_request_idx" ON "job_request_questions" ("job_request_id");
CREATE INDEX IF NOT EXISTS "job_request_questions_asked_by_idx" ON "job_request_questions" ("asked_by_user_id");
CREATE INDEX IF NOT EXISTS "job_request_questions_answered_by_idx" ON "job_request_questions" ("answered_by_user_id");
