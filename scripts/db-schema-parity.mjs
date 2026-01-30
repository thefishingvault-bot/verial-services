import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env', override: false });
import pg from 'pg';

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

  // Prefer URLs that look like Neon pooled endpoints if multiple match.
  const pooled = candidates.find((c) => c.includes('-pooler.'));
  return pooled ?? candidates[0];
}

const { Client } = pg;

async function queryAll(connectionString, sql, params = []) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(sql, params);
    return res.rows;
  } finally {
    await client.end();
  }
}

async function getDbSnapshot(connectionString) {
  const dbRows = await queryAll(connectionString, 'select current_database() as db, inet_server_addr()::text as server_ip');
  const currentDb = dbRows[0]?.db;

  const drizzleReg = await queryAll(connectionString, "select to_regclass('drizzle.__drizzle_migrations') as reg");
  let migrationCount = null;
  let lastMigrationId = null;
  if (drizzleReg[0]?.reg) {
    const countRows = await queryAll(connectionString, 'select count(*)::int as n from drizzle.__drizzle_migrations');
    migrationCount = countRows[0]?.n ?? null;
    const lastRows = await queryAll(
      connectionString,
      'select id from drizzle.__drizzle_migrations order by created_at desc, id desc limit 1'
    );
    lastMigrationId = lastRows[0]?.id ?? null;
  }

  const ext = await queryAll(
    connectionString,
    "select extname from pg_extension order by extname"
  );

  const tables = await queryAll(
    connectionString,
    "select tablename from pg_tables where schemaname = 'public' order by tablename"
  );

  const tableNames = tables.map((r) => r.tablename);

  const criticalTables = ['messages', 'providers', 'provider_invites', 'bookings', 'message_threads'];
  const columnsByTable = {};
  for (const t of criticalTables) {
    const cols = await queryAll(
      connectionString,
      "select column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position",
      [t]
    );
    columnsByTable[t] = cols;
  }

  const messageIndexes = await queryAll(
    connectionString,
    "select indexname, indexdef from pg_indexes where schemaname='public' and tablename='messages' order by indexname"
  );

  return {
    currentDb,
    migrationCount,
    lastMigrationId,
    extensions: ext.map((r) => r.extname),
    tables: tableNames,
    columnsByTable,
    messageIndexes,
  };
}

function keyColumnSet(cols) {
  return new Set(cols.map((c) => `${c.column_name}:${c.data_type}:${c.is_nullable}`));
}

function diffSets(a, b) {
  const onlyA = [...a].filter((x) => !b.has(x)).sort();
  const onlyB = [...b].filter((x) => !a.has(x)).sort();
  return { onlyA, onlyB };
}

function diffArrays(a, b) {
  return diffSets(new Set(a), new Set(b));
}

function printDiff(label, diff) {
  if (diff.onlyA.length === 0 && diff.onlyB.length === 0) return;
  console.log(label);
  if (diff.onlyA.length) console.log('  only in SOURCE:', diff.onlyA.join(', '));
  if (diff.onlyB.length) console.log('  only in TARGET:', diff.onlyB.join(', '));
}

const args = parseArgs(process.argv.slice(2));

// Defaults: FULL_DB (reference) and EMPTY_DB (target)
const sourceHostIncludes = args['source-host'] ?? 'ep-round-moon-a7getxfr';
const sourceDbName = args['source-db'] ?? 'verial';
const targetHostIncludes = args['target-host'] ?? 'ep-patient-firefly-a7hwomzf';
const targetDbName = args['target-db'] ?? 'verial-prod';

const sourceUrl =
  args['source-url'] ?? findDbUrlByIdentity({ hostIncludes: sourceHostIncludes, dbName: sourceDbName });
const targetUrl =
  args['target-url'] ?? findDbUrlByIdentity({ hostIncludes: targetHostIncludes, dbName: targetDbName });

if (!sourceUrl || !targetUrl) {
  console.error('Could not locate DB URLs by identity in environment (.env.local is loaded via dotenv).');
  console.error(`SOURCE identity: host includes "${sourceHostIncludes}", db="${sourceDbName}"`);
  console.error(`TARGET identity: host includes "${targetHostIncludes}", db="${targetDbName}"`);
  console.error('Provide explicit URLs via --source-url / --target-url if needed.');
  process.exit(2);
}

console.log('Collecting schema snapshots (structure only)...');
const [source, target] = await Promise.all([getDbSnapshot(sourceUrl), getDbSnapshot(targetUrl)]);

console.log(`SOURCE current_database=${source.currentDb}`);
console.log(`TARGET current_database=${target.currentDb}`);
if (source.migrationCount != null) {
  console.log(`SOURCE drizzle migrations=${source.migrationCount} last=${source.lastMigrationId ?? 'n/a'}`);
}
if (target.migrationCount != null) {
  console.log(`TARGET drizzle migrations=${target.migrationCount} last=${target.lastMigrationId ?? 'n/a'}`);
}

const tableDiff = diffArrays(source.tables, target.tables);
printDiff('Table list diff:', tableDiff);

const extDiff = diffArrays(source.extensions, target.extensions);
printDiff('Extensions diff:', extDiff);

const criticalTables = ['messages', 'providers', 'provider_invites', 'bookings', 'message_threads'];
for (const t of criticalTables) {
  const sCols = source.columnsByTable[t] ?? [];
  const tCols = target.columnsByTable[t] ?? [];

  const sSet = keyColumnSet(sCols);
  const tSet = keyColumnSet(tCols);

  const d = diffSets(sSet, tSet);
  if (d.onlyA.length || d.onlyB.length) {
    console.log(`Column diff for table ${t}:`);
    if (d.onlyA.length) console.log('  only in SOURCE:', d.onlyA.join(' | '));
    if (d.onlyB.length) console.log('  only in TARGET:', d.onlyB.join(' | '));
  }
}

// Index presence check for known important indexes
const importantMessageIndexes = [
  'messages_thread_created_idx',
  'messages_booking_created_idx',
  'messages_sender_created_idx',
  'messages_unread_idx',
];

function indexNameSet(indexRows) {
  return new Set(indexRows.map((r) => r.indexname));
}

const sIdx = indexNameSet(source.messageIndexes);
const tIdx = indexNameSet(target.messageIndexes);

const idxDiff = diffSets(new Set(importantMessageIndexes.filter((n) => sIdx.has(n))), new Set(importantMessageIndexes.filter((n) => tIdx.has(n))));
// idxDiff here is a bit odd (we want missing in either), so do direct check
const missingInTarget = importantMessageIndexes.filter((n) => sIdx.has(n) && !tIdx.has(n));
const missingInSource = importantMessageIndexes.filter((n) => tIdx.has(n) && !sIdx.has(n));

if (missingInTarget.length || missingInSource.length) {
  console.log('Important message index presence diff:');
  if (missingInTarget.length) console.log('  missing in TARGET:', missingInTarget.join(', '));
  if (missingInSource.length) console.log('  missing in SOURCE:', missingInSource.join(', '));
}

const pass =
  tableDiff.onlyA.length === 0 &&
  tableDiff.onlyB.length === 0 &&
  extDiff.onlyA.length === 0 &&
  extDiff.onlyB.length === 0 &&
  missingInTarget.length === 0 &&
  missingInSource.length === 0 &&
  criticalTables.every((t) => {
    const sSet = keyColumnSet(source.columnsByTable[t] ?? []);
    const tSet = keyColumnSet(target.columnsByTable[t] ?? []);
    return diffSets(sSet, tSet).onlyA.length === 0 && diffSets(sSet, tSet).onlyB.length === 0;
  });

console.log(`Schema parity: ${pass ? 'PASS' : 'FAIL'}`);
process.exit(pass ? 0 : 1);
