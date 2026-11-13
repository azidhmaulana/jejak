import { createDatabase } from '../server/database/index.mjs';
if (process.env.JEJAK_MIGRATION_DATABASE_URL)
  process.env.DATABASE_URL = process.env.JEJAK_MIGRATION_DATABASE_URL;
const db = await createDatabase(process.env.JEJAK_DATA_DIR || '.runtime', { migrate: true });
await db.close();
console.log('PostgreSQL schema is up to date.');
