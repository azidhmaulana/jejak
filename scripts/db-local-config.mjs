import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
mkdirSync('.runtime', { recursive: true });
if (existsSync('.runtime/postgres.env') || existsSync('.env'))
  throw new Error('Local configuration already exists; refusing to overwrite credentials.');
const bootstrap = randomBytes(32).toString('hex');
const app = randomBytes(32).toString('hex');
const test = randomBytes(32).toString('hex');
writeFileSync(
  '.runtime/postgres.env',
  `POSTGRES_USER=jejak_bootstrap\nPOSTGRES_PASSWORD=${bootstrap}\nPOSTGRES_DB=postgres\nPOSTGRES_INITDB_ARGS=--auth-host=scram-sha-256\n`,
  { mode: 0o600 },
);
writeFileSync(
  '.env',
  `DATABASE_URL=postgresql://jejak:${app}@127.0.0.1:55432/jejak\nJEJAK_TEST_DATABASE_URL=postgresql://jejak_test:${test}@127.0.0.1:55432/jejak_test\nJEJAK_DB_SSL=disable\n`,
  { mode: 0o600 },
);
console.log('Generated local-only PostgreSQL credentials in ignored files.');
