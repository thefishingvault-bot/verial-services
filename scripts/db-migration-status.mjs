import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env', override: false });

const { Client } = pg;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function tryParseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function findDbUrlByIdentity({ hostIncludes, dbName }) {
  const candidates = [];
  for (const val of Object.values(process.env)) {
    if (!val || typeof val !== 'string') continue;
    const url = tryParseUrl(val);
    if (!url) continue;
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') continue;

    const host = url.host;
    const database = url.pathname?.replace(/^\//, '') || '';
    if (hostIncludes && !host.includes(hostIncludes)) continue;
    if (dbName && database !== dbName) continue;
    candidates.push(val);
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  return candidates.find((c) => c.includes('-pooler.')) ?? candidates[0];
}

async function run(name, connectionString) {
  if (!connectionString) {
    console.log(`${name}: (missing URL)`);
    return;
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const db = (await client.query('select current_database() as db')).rows[0]?.db;
    const regPublic = (await client.query("select to_regclass('public.__drizzle_migrations') as reg")).rows[0]?.reg;
    const regDrizzle = (await client.query("select to_regclass('drizzle.__drizzle_migrations') as reg")).rows[0]?.reg;

    async function readStats(schemaName) {
      const count = (await client.query(`select count(*)::int as n from ${schemaName}.__drizzle_migrations`)).rows[0]?.n;
      const last = (
        await client.query(
          `select id from ${schemaName}.__drizzle_migrations order by created_at desc, id desc limit 1`
        )
      ).rows[0]?.id;
      return { count, last };
    }

    const publicStats = regPublic ? await readStats('public') : null;
    const drizzleStats = regDrizzle ? await readStats('drizzle') : null;

    console.log(
      `${name}: db=${db}` +
        ` public.__drizzle_migrations=${regPublic ? `YES(${publicStats.count}) last=${publicStats.last ?? 'n/a'}` : 'NO'}` +
        ` drizzle.__drizzle_migrations=${regDrizzle ? `YES(${drizzleStats.count}) last=${drizzleStats.last ?? 'n/a'}` : 'NO'}`
    );
  } finally {
    await client.end();
  }
}

    const args = parseArgs(process.argv.slice(2));

    const fullUrl =
      args['full-url'] ??
      findDbUrlByIdentity({
        hostIncludes: args['full-host'] ?? 'ep-round-moon-a7getxfr',
        dbName: args['full-db'] ?? 'verial',
      });
    const emptyUrl =
      args['empty-url'] ??
      findDbUrlByIdentity({
        hostIncludes: args['empty-host'] ?? 'ep-patient-firefly-a7hwomzf',
        dbName: args['empty-db'] ?? 'verial-prod',
      });

    await run('FULL_DB', fullUrl);
    await run('EMPTY_DB', emptyUrl);
