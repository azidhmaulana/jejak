# PostgreSQL JEJAK

PostgreSQL is now required for accounts, roles, sessions, saved routes, preferences, source activation, audit and analytics. The API no longer opens `accounts.sqlite`; SQLite is read only by the explicit legacy import tool. Offline MBTiles/GMDB readers still use SQLite because it is their tile-package format. Camera catalogs and drawing/overlay files have not been moved into PostgreSQL.

## Local setup (Docker Desktop + Node 24)

On a fresh checkout, with no existing `.env`:

```sh
npm ci
npm run db:local:config
npm run db:up
npm run db:local:provision
npm run db:migrate
npm run dev
```

The config command refuses to overwrite existing credentials. It generates independent random app/test/bootstrap passwords in ignored files. If `.env` already exists, configure it using `.env.example` and provision the database separately. Never put `DATABASE_URL` in a `VITE_` variable.

- App: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:4174`
- Readiness: `/api/ready` checks PostgreSQL; `/api/health` is process liveness.
- Local database: `127.0.0.1:55432`, database `jejak`, non-superuser role `jejak`.
- Isolated tests: database/role `jejak_test`; tests create isolated schemas, never use the app database.
- Docker named volume: `jejak_jejak_postgres`. Stopping/recreating the container preserves it. **Do not run `docker compose down -v` unless intentionally deleting the database.**

`npm run dev` starts the app and API; start PostgreSQL first with `npm run db:up`. Production startup does not run DDL automatically. Development/test startup applies versioned migrations under a PostgreSQL transaction/advisory lock.

## Import existing SQLite data

Stop every API process that writes the legacy DB before importing. Use an empty PostgreSQL destination, run schema migrations, then:

```sh
npm run db:import:sqlite -- .runtime/accounts.sqlite
```

The command first creates a consistent SQLite backup under `.runtime/sqlite-backups/`. It opens the source read-only, imports in bounded batches inside one transaction, compares record contents and counts, and advances the audit identity sequence. Password hashes, session hashes, IDs, timestamps and role permissions are preserved. A populated destination is refused; failed imports roll back. Keep the original and backup until a production restore has been verified. Do not restart an old SQLite-writing build after cutover without reconciling new PostgreSQL writes.

## Deployment

Use a supported PostgreSQL release (local compose uses 17). Keep PostgreSQL on a private network/firewall, accessible only to the backend. The local compose is a development service, not an internet-facing database setup.

Set backend secrets through your deployment secret manager:

- `DATABASE_URL`: restricted runtime login.
- `JEJAK_DB_SSL=verify-full`: production default; checks the server certificate and hostname. Set `JEJAK_DB_CA_FILE` for a private CA. No `rejectUnauthorized:false` fallback. Configure TLS using these options, not connection-string SSL overrides.
- `JEJAK_DB_SCHEMA=public` or a pre-created isolated schema.
- `JEJAK_DB_POOL_MAX=10`: per API process. Budget total pools across all replicas against the server connection limit.
- `JEJAK_MIGRATION_DATABASE_URL`: separate schema-owner credential, supplied only to release migration/import commands, not the running API.

Runtime role should have CONNECT, schema USAGE, table SELECT/INSERT/UPDATE/DELETE and sequence USAGE/SELECT, but no superuser, role creation, database creation or schema ownership. Have the migration owner create tables and grant runtime permissions, including default privileges for future migrations. Local provisioning creates a non-superuser schema owner for developer convenience; do not reuse that bootstrap setup as production runtime privileges.

Run `npm run db:migrate` with the migration owner, then `npm run build` and `npm start`. The release should gate readiness on `/api/ready`. HTTPS/reverse-proxy settings, session-cookie protections and API role/permission checks remain required.

The pool uses a 5-second connection timeout, 15-second statement timeout, and 30-second idle-transaction timeout. Transactions use one checked-out connection; failures roll back. Indexed timestamp/user/session columns support current queries. Scale still needs measured load tests: analytics aggregation scans the selected period; add daily aggregates/partitioning as measured traffic grows. File-backed drawing/overlay stores and in-memory rate limits are still single-instance concerns.

## Backup and restore

Use managed automated backups/PITR in production, encrypted off-host storage, retention policies, and scheduled restore drills. Local example, without exposing a password on the command line:

```sh
docker compose exec -T postgres pg_dump -U jejak_bootstrap -d jejak -Fc -f /tmp/jejak.dump
docker compose cp postgres:/tmp/jejak.dump .runtime/jejak.dump
```

Restore into a **new empty database** with `pg_restore --no-owner --no-privileges --dbname=... jejak.dump` using deployment secrets rather than a password embedded in shell history. Verify counts, login and permissions, saved routes, source activation, and both analytics endpoints before switching traffic. Also back up `.runtime` drawing/overlay/offline assets separately; they are not included in `pg_dump`.

## Verification

`npm test` uses real PostgreSQL. It covers role/session boundaries, transaction rollback, parameter binding, migration verification and SQL timestamps. `npm run test:browser` uses its own database schema and per-test proxy IP to isolate rate-limit buckets; production limits are unchanged.

References: [node-postgres pools](https://node-postgres.com/features/pooling), [transactions](https://node-postgres.com/features/transactions), [TLS](https://node-postgres.com/features/ssl), [PostgreSQL backup](https://www.postgresql.org/docs/17/backup-dump.html).
