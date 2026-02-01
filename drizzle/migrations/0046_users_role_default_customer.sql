-- Set default users.role to 'customer'
--
-- This must run in a separate migration from the enum change (adding 'customer' to user_role)
-- because Postgres requires new enum values to be committed before they can be referenced.

ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'customer';
