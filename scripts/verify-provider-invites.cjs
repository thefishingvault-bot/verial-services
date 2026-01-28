/* eslint-disable @typescript-eslint/no-require-imports */

require("dotenv").config({ path: ".env.local" });

const { Client } = require("pg");

async function assertColumnExists(client, tableName, columnName) {
  const res = await client.query(
    `
      select 1
      from information_schema.columns
      where table_schema='public'
        and table_name=$1
        and column_name=$2
      limit 1;
    `,
    [tableName, columnName],
  );
  if (res.rowCount === 0) {
    throw new Error(`Missing column public.${tableName}.${columnName}`);
  }
}

async function assertTableExists(client, tableName) {
  const res = await client.query(
    `
      select 1
      from information_schema.tables
      where table_schema='public'
        and table_name=$1
      limit 1;
    `,
    [tableName],
  );
  if (res.rowCount === 0) {
    throw new Error(`Missing table public.${tableName}`);
  }
}

async function assertEnumExists(client, enumName) {
  const res = await client.query(
    `
      select 1
      from pg_type
      where typname = $1
      limit 1;
    `,
    [enumName],
  );
  if (res.rowCount === 0) {
    throw new Error(`Missing enum type ${enumName}`);
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (expected in .env.local)");

  const client = new Client({ connectionString: url });
  await client.connect();

  await assertEnumExists(client, "provider_invite_status");
  await assertTableExists(client, "provider_invites");

  await assertColumnExists(client, "provider_invites", "id");
  await assertColumnExists(client, "provider_invites", "email");
  await assertColumnExists(client, "provider_invites", "email_lower");
  await assertColumnExists(client, "provider_invites", "token");
  await assertColumnExists(client, "provider_invites", "status");
  await assertColumnExists(client, "provider_invites", "created_at");
  await assertColumnExists(client, "provider_invites", "created_by_user_id");
  await assertColumnExists(client, "provider_invites", "redeemed_at");
  await assertColumnExists(client, "provider_invites", "redeemed_by_user_id");
  await assertColumnExists(client, "provider_invites", "notes");

  await assertColumnExists(client, "users", "early_provider_access");

  console.log("OK: provider invites schema present.");

  await client.end();
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
