ALTER TABLE "provider_invites"
  ADD COLUMN IF NOT EXISTS "invite_email_sent_at" timestamp,
  ADD COLUMN IF NOT EXISTS "invite_email_to" varchar(255),
  ADD COLUMN IF NOT EXISTS "invite_email_resend_id" varchar(255),
  ADD COLUMN IF NOT EXISTS "invite_email_error" text;
