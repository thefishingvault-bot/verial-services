-- Align conversations schema to userA/userB and add metadata
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversations'
      AND column_name = 'user1_id'
  ) THEN
    ALTER TABLE "conversations" RENAME COLUMN "user1_id" TO "user_a_id";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversations'
      AND column_name = 'user2_id'
  ) THEN
    ALTER TABLE "conversations" RENAME COLUMN "user2_id" TO "user_b_id";
  END IF;
END $$;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;

-- Normalize participant ordering to prevent duplicate pairs
UPDATE "conversations"
SET "user_a_id" = LEAST("user_a_id", "user_b_id"),
    "user_b_id" = GREATEST("user_a_id", "user_b_id");

-- Remove duplicates keeping the earliest conversation id
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT LEAST(user_a_id, user_b_id) AS a,
           GREATEST(user_a_id, user_b_id) AS b,
           ARRAY_AGG(id ORDER BY created_at) AS ids
    FROM conversations
    GROUP BY 1,2
    HAVING COUNT(*) > 1
  ) LOOP
    IF array_length(r.ids, 1) > 1 THEN
      DELETE FROM conversations WHERE id = ANY (r.ids[2:array_length(r.ids,1)]);
    END IF;
  END LOOP;
END $$;

-- Recreate uniqueness and ordering indexes
DROP INDEX IF EXISTS "conversations_user_pair_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_user_pair_unique" ON "conversations" ("user_a_id", "user_b_id");
DROP INDEX IF EXISTS "conversations_last_message_idx";
CREATE INDEX IF NOT EXISTS "conversations_last_message_idx" ON "conversations" ("last_message_at");

-- Messages schema changes
ALTER TABLE "messages" DROP COLUMN IF EXISTS "is_read";
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "read_at" timestamp;
DROP INDEX IF EXISTS "messages_conversation_created_idx";
CREATE INDEX IF NOT EXISTS "messages_conversation_created_idx" ON "messages" ("conversation_id", "created_at");
