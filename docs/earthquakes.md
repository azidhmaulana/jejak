# Earthquakes

The left sidebar opens a compact earthquake panel with latest, rolling 48-hour,
and date-range modes, marker visibility, source details, and map selection.
Dates entered in the panel cover inclusive WIB calendar days. The latest footer
record remains live while the user browses history. M6+ receives stronger visual
emphasis; this is a UI threshold, not a tsunami or impact classification.

## Sources and coverage

- BMKG: https://data.bmkg.go.id/gempabumi/ — three public JSON feeds, checked every
  minute by the server. Feed records merge by event time, preserving felt and
  potential information. These feeds are not a complete local earthquake catalog.
- USGS: https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson
  checked every five minutes, supplementing recent records.
- Historical search: https://earthquake.usgs.gov/fdsnws/event/1/ — date queries,
  1,000 records per page; the panel offers additional archive pages. No magnitude
  cutoff. Cached BMKG observations within the selected interval are also included.
- Geographic scope is a rectangle covering Indonesia and surrounding waters:
  92–142 E, 12 S–8 N. It includes some neighboring territory. Agency solutions are
  kept separately and labeled, so counts describe records, not deduplicated events.
- Source failures preserve previously collected live data and display a stale
  indicator. Historical partial failures are shown explicitly. Empty results do
  not prove that no earthquake occurred. No prediction or early-warning guarantee.

## Redis

Set backend-only `JEJAK_REDIS_URL`. Local development uses
`redis://127.0.0.1:56379` and `docker compose up -d --wait redis`.
Redis is a separate JEJAK service with AOF and a named volume; no shared BMS keys
are used. Keys are prefixed `jejak:earthquakes:v1:`. Observed records retain 180
days; historical search caches retain ten minutes. This is temporary storage,
not a permanent historical archive. Redis outage returns HTTP 503 without
silently switching storage to the application's PostgreSQL database.

For deployment use a private authenticated Redis endpoint, TLS where applicable,
and monitor capacity. The supplied local service binds only to loopback and is
limited to 256 MB with no eviction. A poll lock limits duplicate source requests
across app processes. Source downloads have deadlines and a size limit;
historical requests validate dates and have a two-request per-process concurrency
limit in addition to the application's normal API rate limit.

Verification: `node --test test/earthquakes.test.mjs` and
`npx playwright test test/browser/earthquakes.spec.ts`.
