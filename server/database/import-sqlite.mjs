import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

const tables = {
  roles: ['id', 'permissions'],
  users: ['id', 'email', 'name', 'password', 'role', 'active'],
  sessions: ['token', 'user_id', 'expires'],
  audit: ['id', 'actor', 'action', 'target', 'time'],
  routes: ['id', 'user_id', 'name', 'data', 'created'],
  preferences: ['user_id', 'data'],
  camera_sources: ['name', 'active'],
  analytics_events: [
    'id',
    'time',
    'kind',
    'visitor',
    'session',
    'camera',
    'seconds',
    'device',
    'referrer',
  ],
  analytics_migrations: ['id'],
};
const digest = (rows, columns) =>
  createHash('sha256')
    .update(JSON.stringify(rows.map((row) => columns.map((c) => row[c]))))
    .digest('hex');

/** Read-only, bounded batches, all-or-nothing target import. Never overwrites a populated DB. */
export async function importSQLite(filename, db) {
  const source = new DatabaseSync(filename, { readOnly: true });
  source.exec('BEGIN');
  try {
    const available = new Set(
      source
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((r) => r.name),
    );
    if (!available.has('users') || !available.has('roles'))
      throw new Error('Source is not a JEJAK accounts database.');
    return await db.transaction(async () => {
      await db.query(
        "SELECT pg_advisory_xact_lock(hashtext(current_schema() || ':sqlite-import'))",
      );
      // Block concurrent writes until verified import commits. API should already be stopped.
      await db.exec(`LOCK TABLE ${Object.keys(tables).join(',')} IN ACCESS EXCLUSIVE MODE`);
      for (const table of Object.keys(tables).filter((t) => t !== 'roles')) {
        if ((await db.prepare(`SELECT COUNT(*) n FROM ${table}`).get()).n)
          throw new Error('Destination contains data; use an empty PostgreSQL database.');
      }
      const counts = {};
      for (const [table, columns] of Object.entries(tables)) {
        if (!available.has(table)) {
          counts[table] = 0;
          continue;
        }
        let cursor;
        let total = 0;
        for (;;) {
          const key = columns[0];
          const rows = source
            .prepare(
              `SELECT ${columns.join(',')} FROM ${table} ${cursor === undefined ? '' : `WHERE ${key}>?`} ORDER BY ${key} LIMIT 500`,
            )
            .all(...(cursor === undefined ? [] : [cursor]));
          if (!rows.length) break;
          const values = rows.flatMap((row) => columns.map((c) => row[c]));
          const placeholders = rows.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
          const conflict =
            table === 'roles'
              ? ' ON CONFLICT(id) DO UPDATE SET permissions=excluded.permissions'
              : '';
          await db.query(
            `INSERT INTO ${table}(${columns.join(',')}) VALUES ${placeholders}${conflict}`,
            values,
          );
          const copied = await db
            .prepare(
              `SELECT ${columns.join(',')} FROM ${table} WHERE ${key} IN (${rows.map(() => '?').join(',')})`,
            )
            .all(...rows.map((r) => r[key]));
          const byKey = new Map(copied.map((r) => [r[key], r]));
          if (
            digest(rows, columns) !==
            digest(
              rows.map((r) => byKey.get(r[key])),
              columns,
            )
          )
            throw new Error(`Verification failed for ${table}. Transaction rolled back.`);
          total += rows.length;
          cursor = rows.at(-1)[key];
        }
        counts[table] = total;
        if (
          table !== 'roles' &&
          (await db.prepare(`SELECT COUNT(*) n FROM ${table}`).get()).n !== total
        )
          throw new Error(`Count mismatch for ${table}.`);
      }
      await db.query(
        "SELECT setval(pg_get_serial_sequence('audit','id'), COALESCE((SELECT MAX(id) FROM audit),1), EXISTS(SELECT 1 FROM audit))",
      );
      return counts;
    });
  } finally {
    source.exec('ROLLBACK');
    source.close();
  }
}
