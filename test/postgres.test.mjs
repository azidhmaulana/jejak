import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createDatabase, databaseConfig, parameters } from '../server/database/index.mjs';
import { importSQLite } from '../server/database/import-sqlite.mjs';

test('PostgreSQL configuration requires credentials, verified TLS and bounded pool', () => {
  assert.throws(() => databaseConfig('.', {}), /DATABASE_URL/);
  const env = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://app:secret@db.example/jejak' };
  const config = databaseConfig('.', env);
  assert.equal(config.pool.ssl.rejectUnauthorized, true);
  assert.equal(config.pool.max, 10);
  assert.throws(
    () =>
      databaseConfig('.', {
        ...env,
        NODE_ENV: 'test',
        JEJAK_TEST_DATABASE_URL: 'postgresql://other:password@db.example:5432/jejak',
      }),
    /separate database/,
  );
  assert.throws(
    () => databaseConfig('.', { ...env, DATABASE_URL: env.DATABASE_URL + '?sslmode=no-verify' }),
    /SSL query/,
  );
  assert.throws(() => databaseConfig('.', { ...env, JEJAK_DB_POOL_MAX: 'Infinity' }), /pool size/);
  assert.throws(
    () => databaseConfig('.', { ...env, JEJAK_DB_SCHEMA: 'public; DROP SCHEMA public' }),
    /schema/,
  );
  assert.equal(
    parameters("SELECT '?' literal, ? value, 'it''s ?' quoted"),
    "SELECT '?' literal, $1 value, 'it''s ?' quoted",
  );
});

test('PostgreSQL transactions rollback and parameterized queries cannot inject SQL', async () => {
  const db = await createDatabase(`.runtime/pg-test-${randomUUID()}`);
  try {
    await assert.rejects(
      db.transaction(async () => {
        await db.prepare('INSERT INTO camera_sources VALUES(?,?)').run('rollback', 1);
        throw new Error('abort');
      }),
      /abort/,
    );
    assert.equal(
      await db.prepare('SELECT * FROM camera_sources WHERE name=?').get('rollback'),
      undefined,
    );
    const name = "'; DROP TABLE users; --";
    await db.prepare('INSERT INTO camera_sources VALUES(?,?)').run(name, 0);
    assert.equal(
      (await db.prepare('SELECT active FROM camera_sources WHERE name=?').get(name)).active,
      0,
    );
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM users').get()).n, 0);
    assert.equal(
      (await db.query('SELECT rolsuper,rolcreaterole FROM pg_roles WHERE rolname=current_user'))
        .rows[0].rolsuper,
      false,
    );
  } finally {
    await db.close();
  }
});

test('SQLite import preserves hashes, roles, sessions and BIGINT timestamps; repeat import is refused', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'jejak-import-'));
  const filename = path.join(directory, 'accounts.sqlite');
  const source = new DatabaseSync(filename);
  source.exec(`CREATE TABLE roles(id TEXT PRIMARY KEY,permissions TEXT); CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,name TEXT,password TEXT,role TEXT,active INTEGER);
    CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id TEXT,expires INTEGER);
    CREATE TABLE audit(id INTEGER PRIMARY KEY,actor TEXT,action TEXT,target TEXT,time INTEGER);
    INSERT INTO roles VALUES('viewer','["routes.use"]');
    INSERT INTO users VALUES('test-user','test@example.test','Test','salt:hashed-value','viewer',1);
    INSERT INTO sessions VALUES('hashed-token','test-user',1999999999999);
    INSERT INTO audit VALUES(42,'test-user','login','test-user',1770000000000);`);
  source.close();
  const db = await createDatabase(directory);
  try {
    const counts = await importSQLite(filename, db);
    assert.equal(counts.users, 1);
    assert.equal(
      (await db.prepare('SELECT password FROM users WHERE id=?').get('test-user')).password,
      'salt:hashed-value',
    );
    assert.equal(
      (await db.prepare('SELECT permissions FROM roles WHERE id=?').get('viewer')).permissions,
      '["routes.use"]',
    );
    assert.equal((await db.prepare('SELECT expires FROM sessions').get()).expires, 1999999999999);
    await db.prepare('INSERT INTO audit(action,time) VALUES(?,?)').run('after-import', Date.now());
    assert.equal((await db.prepare('SELECT MAX(id) n FROM audit').get()).n, 43);
    await assert.rejects(importSQLite(filename, db), /Destination contains data/);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM users').get()).n, 1);
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('invalid SQLite import rolls back earlier role and user writes', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'jejak-import-invalid-'));
  const filename = path.join(directory, 'accounts.sqlite');
  const source = new DatabaseSync(filename);
  source.exec(`CREATE TABLE roles(id TEXT PRIMARY KEY,permissions TEXT);
    CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,name TEXT,password TEXT,role TEXT,active INTEGER);
    INSERT INTO roles VALUES('viewer','[]');
    INSERT INTO users VALUES('invalid','bad@example.test','Bad','hash','missing-role',1);`);
  source.close();
  const db = await createDatabase(directory);
  try {
    await assert.rejects(importSQLite(filename, db), (error) => error.code === '23503');
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM users').get()).n, 0);
    assert.deepEqual(
      JSON.parse(
        (await db.prepare("SELECT permissions FROM roles WHERE id='viewer'").get()).permissions,
      ),
      ['routes.use', 'routes.save'],
    );
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
