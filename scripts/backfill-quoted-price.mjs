import process from "node:process";
import { neon } from "@neondatabase/serverless";

const YES = process.argv.includes("--yes");

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  fail("Missing DATABASE_URL env var.");
}

const sql = neon(process.env.DATABASE_URL);

const COUNT_SQL = `
  select count(*)::int as count
  from bookings
  where provider_quoted_price is null
    and price_at_booking is not null
    and price_at_booking > 0
    and status in ('accepted','paid','completed','completed_by_provider');
`;

const UPDATE_SQL = `
  update bookings
  set provider_quoted_price = price_at_booking
  where provider_quoted_price is null
    and price_at_booking is not null
    and price_at_booking > 0
    and status in ('accepted','paid','completed','completed_by_provider');
`;

const [{ count }] = await sql(COUNT_SQL);
console.log(`[backfill-quoted-price] Rows eligible: ${count}`);

if (!YES) {
  console.log("[backfill-quoted-price] Dry run. Re-run with --yes to apply.");
  process.exit(0);
}

if (count === 0) {
  console.log("[backfill-quoted-price] Nothing to do.");
  process.exit(0);
}

const result = await sql(UPDATE_SQL);
// neon returns an array for SELECTs; for UPDATEs it returns an object-ish result in some drivers.
console.log("[backfill-quoted-price] Backfill executed.");
console.log(result);
