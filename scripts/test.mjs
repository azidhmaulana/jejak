import { spawn } from 'node:child_process';
if (!process.env.JEJAK_TEST_DATABASE_URL)
  throw new Error('Set JEJAK_TEST_DATABASE_URL to a separate PostgreSQL test database.');
if (process.env.JEJAK_TEST_DATABASE_URL === process.env.DATABASE_URL)
  throw new Error('Tests must not use the application database.');
const child = spawn(
  process.execPath,
  ['--test', ...(process.argv.slice(2).length ? process.argv.slice(2) : ['test/*.test.mjs'])],
  { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test', JEJAK_REDIS_URL: '' } },
);
child.on('exit', (code) => (process.exitCode = code || 0));
