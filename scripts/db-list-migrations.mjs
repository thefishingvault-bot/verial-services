import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env', override: false });

const { Client } = pg;

async function run(label, url) {
  if (!url) {
    console.log(`${label}: (missing url)`);
    return;
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const db = (await client.query('select current_database() as db')).rows[0]?.db;
    const rows = (
      await client.query(
        "select id, hash, created_at from drizzle.__drizzle_migrations order by created_at asc, id asc"
      )
    ).rows;

    console.log(`${label}: db=${db} applied=${rows.length}`);
    console.log(`${label}: first=${rows[0]?.id ?? 'n/a'} last=${rows[rows.length - 1]?.id ?? 'n/a'}`);

    const tail = rows.slice(-10).map((r) => r.id);
    console.log(`${label}: last10=${tail.join(',')}`);
  } finally {
    await client.end();
  }
}

await run('SOURCE', process.env.SOURCE_DATABASE_URL);
await run('TARGET', process.env.TARGET_DATABASE_URL);
