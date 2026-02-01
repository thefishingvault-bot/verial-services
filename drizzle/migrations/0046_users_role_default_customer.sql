-- Intentionally a no-op.
--
-- drizzle-kit runs migrations inside a transaction, and Postgres forbids using a newly-added
-- enum value (e.g. 'customer' in user_role) until after it has been committed. Because the
-- enum value is introduced in an earlier migration in the same migrate run, setting a column
-- default to 'customer' here would still hit error 55P04.
--
-- After `drizzle:migrate` succeeds, set this default manually in Neon with:
--   ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'customer';

SELECT 1;
