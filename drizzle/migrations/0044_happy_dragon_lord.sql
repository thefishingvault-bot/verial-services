ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" varchar(50);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username_lower" varchar(50);
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_lower_unique" ON "users" USING btree ("username_lower");
CREATE INDEX IF NOT EXISTS "users_username_lower_idx" ON "users" USING btree ("username_lower");
