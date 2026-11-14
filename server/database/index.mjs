import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Existing API represents millisecond timestamps/counters as safe JS integers.
const types = {
  getTypeParser: (oid, format) =>
    oid === 20
      ? (value) => {
          const n = Number(value);
          if (!Number.isSafeInteger(n)) throw new Error('Database integer exceeds safe range.');
          return n;
        }
      : pg.types.getTypeParser(oid, format),
};
export function databaseConfig(directory = '.runtime', env = process.env) {
  const test = env.NODE_ENV === 'test';
  const connectionString = test ? env.JEJAK_TEST_DATABASE_URL : env.DATABASE_URL;
  if (!connectionString)
    throw new Error(
      test
        ? 'JEJAK_TEST_DATABASE_URL is required.'
        : 'DATABASE_URL is required. Configure PostgreSQL before starting JEJAK.',
    );
  const url = new URL(connectionString);
  if (test && env.DATABASE_URL) {
    const app = new URL(env.DATABASE_URL);
    if (
      app.hostname === url.hostname &&
      (app.port || '5432') === (url.port || '5432') &&
      app.pathname === url.pathname
    )
      throw new Error(
        'Tests require a separate database, not another credential for the app database.',
      );
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('DATABASE_URL must use PostgreSQL.');
  // TLS is configured in one place; connection-string overrides must not weaken verification.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'])
    if (url.searchParams.has(key))
      throw new Error('Use JEJAK_DB_SSL and JEJAK_DB_CA_FILE instead of SSL query parameters.');
  const sslMode = env.JEJAK_DB_SSL || (env.NODE_ENV === 'production' ? 'verify-full' : 'disable');
  if (!['disable', 'verify-full'].includes(sslMode))
    throw new Error('JEJAK_DB_SSL must be disable or verify-full.');
  const schema = test
    ? `test_${createHash('sha256').update(path.resolve(directory)).digest('hex').slice(0, 24)}`
    : env.JEJAK_DB_SCHEMA || 'public';
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid database schema.');
  const max = Number(env.JEJAK_DB_POOL_MAX || (test ? 4 : 10));
  if (!Number.isInteger(max) || max < 1 || max > 100)
    throw new Error('Invalid database pool size.');
  return {
    schema,
    test,
    pool: {
      connectionString,
      types,
      max,
      ssl:
        sslMode === 'verify-full'
          ? {
              rejectUnauthorized: true,
              ...(env.JEJAK_DB_CA_FILE ? { ca: readFileSync(env.JEJAK_DB_CA_FILE, 'utf8') } : {}),
            }
          : false,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 15000,
      idle_in_transaction_session_timeout: 30000,
      application_name: 'jejak',
      options: `-c search_path=${schema},pg_catalog`,
    },
  };
}
// Only repository SQL uses this adapter. Values always travel separately to pg.
export function parameters(sql) {
  let index = 0;
  return sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g, (part) =>
    part === '?' ? `$${++index}` : part,
  );
}
export async function createDatabase(
  directory,
  { migrate = process.env.NODE_ENV !== 'production' } = {},
) {
  const config = databaseConfig(directory);
  const pool = new pg.Pool(config.pool);
  pool.on('error', () => console.error('PostgreSQL pool connection failed.'));
  const context = new AsyncLocalStorage();
  const query = (sql, values = []) => (context.getStore() || pool).query(parameters(sql), values);
  const db = {
    schema: config.schema,
    query,
    exec: (sql) => query(sql),
    prepare: (sql) => ({
      get: async (...values) => (await query(sql, values)).rows[0],
      all: async (...values) => (await query(sql, values)).rows,
      run: async (...values) => ({ changes: (await query(sql, values)).rowCount }),
    }),
    transaction: async (work) => {
      if (context.getStore()) return work(db);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await context.run(client, () => work(db));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
  try {
    if (config.test) await pool.query(`CREATE SCHEMA IF NOT EXISTS "${config.schema}"`);
    if (migrate) await migrateDatabase(db);
    else if (!(await query("SELECT version FROM schema_migrations WHERE version='003'")).rowCount)
      throw new Error('Database migration is required before production startup.');
    return db;
  } catch (error) {
    await pool.end();
    throw error;
  }
}
export async function migrateDatabase(db) {
  await db.transaction(async () => {
    await db.query(
      "SELECT pg_advisory_xact_lock(hashtext(current_schema() || ':jejak-migration'))",
    );
    await db.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
    );
    if (!(await db.prepare('SELECT version FROM schema_migrations WHERE version=?').get('001'))) {
      await db.exec(readFileSync(new URL('./migrations/001_initial.sql', import.meta.url), 'utf8'));
      await db.prepare('INSERT INTO schema_migrations(version) VALUES(?)').run('001');
    }
    if (!(await db.prepare('SELECT version FROM schema_migrations WHERE version=?').get('002'))) {
      await db.exec(
        readFileSync(new URL('./migrations/002_camera_checks.sql', import.meta.url), 'utf8'),
      );
      await db.prepare('INSERT INTO schema_migrations(version) VALUES(?)').run('002');
    }
    if (!(await db.prepare('SELECT version FROM schema_migrations WHERE version=?').get('003'))) {
      await db.exec(readFileSync(new URL('./migrations/003_hotspot_sources.sql', import.meta.url), 'utf8'));
      await db.prepare('INSERT INTO schema_migrations(version) VALUES(?)').run('003');
    }
  });
}
