import dotenv from 'dotenv';

// Prefer .env.local (used by drizzle-kit in this repo)
dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env', override: false });

function summarizeUrl(name, value) {
  if (!value) return { name, present: false };
  let url;
  try {
    url = new URL(value);
  } catch {
    return { name, present: true, parseable: false };
  }

  const host = url.host;
  const database = url.pathname?.replace(/^\//, '') || '';

  return {
    name,
    present: true,
    parseable: true,
    host,
    database,
  };
}

const vars = [
  'SOURCE_DATABASE_URL',
  'TARGET_DATABASE_URL',
  'DATABASE_URL',
];

const results = vars.map((v) => summarizeUrl(v, process.env[v]));

for (const r of results) {
  if (!r.present) {
    console.log(`${r.name}: (not set)`);
    continue;
  }
  if (r.parseable === false) {
    console.log(`${r.name}: (set, but not a valid URL)`);
    continue;
  }
  console.log(`${r.name}: host=${r.host} db=${r.database}`);
}
