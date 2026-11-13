import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createDatabase } from '../server/database/index.mjs';
import { importSQLite } from '../server/database/import-sqlite.mjs';
if (process.env.JEJAK_MIGRATION_DATABASE_URL)
  process.env.DATABASE_URL = process.env.JEJAK_MIGRATION_DATABASE_URL;

const filename = path.resolve(process.argv[2] || '.runtime/accounts.sqlite');
const backupDirectory = path.resolve('.runtime/sqlite-backups');
mkdirSync(backupDirectory, { recursive: true });
const snapshot = path.join(backupDirectory, `accounts-${Date.now()}.sqlite`);
const source = new DatabaseSync(filename, { readOnly: true });
try {
  await backup(source, snapshot);
} finally {
  source.close();
}
const db = await createDatabase(process.env.JEJAK_DATA_DIR || '.runtime', { migrate: true });
try {
  const counts = await importSQLite(snapshot, db);
  console.log(JSON.stringify({ imported: counts, verified: true, backup: snapshot }));
} catch (error) {
  console.error(
    'Import failed; transaction rolled back. Source and backup were preserved.',
    error.code || 'validation',
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
