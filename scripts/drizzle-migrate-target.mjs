import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env', override: false });
import { spawnSync } from 'node:child_process';

const target = process.env.TARGET_DATABASE_URL;
if (!target) {
  console.error('TARGET_DATABASE_URL is not set (dotenv loads .env.local by default).');
  process.exit(2);
}

const env = { ...process.env, DATABASE_URL: target };

console.log('Running drizzle migrations against TARGET (DATABASE_URL overridden from TARGET_DATABASE_URL)...');
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
