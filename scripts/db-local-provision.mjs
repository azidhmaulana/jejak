import pg from 'pg';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
const config = parseEnv(readFileSync('.runtime/postgres.env', 'utf8'));
const localPort = Number(process.env.JEJAK_DB_PORT || 55432);
if (!Number.isInteger(localPort) || localPort < 1024 || localPort > 65535)
  throw new Error('Invalid JEJAK_DB_PORT.');
const pool = new pg.Pool({
  host: '127.0.0.1',
  port: localPort,
  user: config.POSTGRES_USER,
  password: config.POSTGRES_PASSWORD,
  database: 'postgres',
});
try {
  for (const [name, variable] of [
    ['jejak', 'DATABASE_URL'],
    ['jejak_test', 'JEJAK_TEST_DATABASE_URL'],
  ]) {
    const url = new URL(process.env[variable]);
    if (
      url.hostname !== '127.0.0.1' ||
      url.port !== String(localPort) ||
      url.username !== name ||
      url.pathname !== `/${name}`
    )
      throw new Error('Local provision only supports dedicated JEJAK local databases.');
    if (!(await pool.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [name])).rowCount) {
      // Identifiers are fixed above; secret is escaped as a SQL literal, never logged.
      const password = decodeURIComponent(url.password).replaceAll("'", "''");
      await pool.query(
        `CREATE ROLE ${name} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${password}'`,
      );
    }
    if (!(await pool.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount)
      await pool.query(`CREATE DATABASE ${name} OWNER ${name}`);
    await pool.query(`REVOKE ALL ON DATABASE ${name} FROM PUBLIC`);
    await pool.query(`GRANT CONNECT ON DATABASE ${name} TO ${name}`);
  }
  console.log('Provisioned isolated app and test databases with non-superuser roles.');
} finally {
  await pool.end();
}
