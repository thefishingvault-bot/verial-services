/* eslint-disable @typescript-eslint/no-require-imports */

require("dotenv").config({ path: ".env.local" });

const { Client } = require("pg");

const REQUIRED_COLUMNS = [
  "plan",
  "stripe_customer_id",
  "stripe_subscription_id",
  "stripe_subscription_status",
  "stripe_subscription_price_id",
  "stripe_current_period_end",
  "stripe_cancel_at_period_end",
  "stripe_subscription_updated_at",
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (expected in .env.local)");

  const client = new Client({ connectionString: url });
  await client.connect();

  const sql = `
    select column_name
    from information_schema.columns
    where table_schema='public'
      and table_name='providers'
      and column_name = any($1::text[])
    order by column_name;
  `;

  const res = await client.query(sql, [REQUIRED_COLUMNS]);
  const found = new Set(res.rows.map((r) => r.column_name));
  const missing = REQUIRED_COLUMNS.filter((c) => !found.has(c));

  console.log("providers columns found:", Array.from(found));
  if (missing.length) {
    console.error("Missing columns:", missing);
    process.exitCode = 2;
  } else {
    console.log("OK: all required subscription columns exist.");
  }

  await client.end();
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
