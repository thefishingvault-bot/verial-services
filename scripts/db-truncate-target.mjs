
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

async function queryOne(client, sql, params = []) {
	const res = await client.query(sql, params);
	return res.rows[0];
}

async function queryAll(client, sql, params = []) {
	const res = await client.query(sql, params);
	return res.rows;
}

function quoteIdent(ident) {
	return `"${String(ident).replace(/"/g, '""')}"`;
}

const args = parseArgs(process.argv.slice(2));

const targetHostIncludes = args['target-host'] ?? 'ep-patient-firefly-a7hwomzf';
const targetDbName = args['target-db'] ?? 'verial-prod';
const targetUrl = args['target-url'] ?? findDbUrlByIdentity({ hostIncludes: targetHostIncludes, dbName: targetDbName });

if (!targetUrl) {
	console.error('Could not locate target DB URL by identity in environment (.env.local is loaded via dotenv).');
	console.error(`TARGET identity: host includes "${targetHostIncludes}", db="${targetDbName}"`);
	console.error('Provide explicit URL via --target-url if needed.');
	process.exit(2);
}

const apply = Boolean(args.apply);
const exclude = new Set(
	(args.exclude ? String(args.exclude).split(',') : [])
		.map((s) => s.trim())
		.filter(Boolean)
);

const client = new Client({ connectionString: targetUrl });
await client.connect();
try {
	const ident = await queryOne(
		client,
		"select current_database() as db, inet_server_addr()::text as server_ip"
	);

	console.log(`Target db=${ident.db} server_ip=${ident.server_ip ?? 'n/a'}`);
	if (ident.db !== targetDbName) {
		console.error(`Refusing to run: expected db=${targetDbName}`);
		process.exit(3);
	}

	const tables = await queryAll(
		client,
		"select tablename from pg_tables where schemaname='public' order by tablename"
	);

	const tableNames = tables
		.map((r) => r.tablename)
		.filter((t) => !exclude.has(t));

	if (tableNames.length === 0) {
		console.log('No public tables to truncate (after excludes).');
		process.exit(0);
	}

	const stats = await queryAll(
		client,
		"select relname as table_name, n_live_tup::bigint as approx_rows from pg_stat_user_tables order by relname"
	);

	console.log('\nApprox row counts (pg_stat_user_tables):');
	for (const r of stats) {
		if (!tableNames.includes(r.table_name)) continue;
		console.log(`  ${r.table_name}: ${r.approx_rows}`);
	}

	const truncateSql = `TRUNCATE TABLE ${tableNames
		.map((t) => `public.${quoteIdent(t)}`)
		.join(', ')} RESTART IDENTITY CASCADE;`;

	console.log('\nTRUNCATE statement (review before applying):');
	console.log(truncateSql);

	if (!apply) {
		console.log('\nDry run only. Re-run with --apply to execute.');
		process.exit(0);
	}

	await client.query('begin');
	await client.query(truncateSql);
	await client.query('commit');
	console.log('\nApplied successfully.');
} catch (e) {
	try {
		await client.query('rollback');
	} catch {
		// ignore
	}
	console.error(String(e?.stack ?? e));
	process.exit(1);
} finally {
	await client.end();
}

