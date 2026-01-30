import dotenv from 'dotenv';
import { spawnSync } from 'node:child_process';

dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env', override: false });

const source = process.env.SOURCE_DATABASE_URL;
if (!source) {
  console.error('SOURCE_DATABASE_URL is not set (dotenv loads .env.local by default).');
  process.exit(2);
}

const env = { ...process.env, DATABASE_URL: source };

console.log('Running drizzle migrations against SOURCE (DATABASE_URL overridden from SOURCE_DATABASE_URL)...');
const migrate = spawnSync('pnpm', ['-s', 'run', 'drizzle:migrate'], {
  stdio: 'inherit',
  env,
  shell: true,
});
if (migrate.status !== 0) process.exit(migrate.status ?? 1);

console.log('Running drizzle journal check...');
const check = spawnSync('pnpm', ['-s', 'run', 'drizzle:check-journal'], {
  stdio: 'inherit',
  env,
  shell: true,
});
process.exit(check.status ?? 0);
