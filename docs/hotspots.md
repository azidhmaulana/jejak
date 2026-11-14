# Hotspots

Hotspot controls are in the left rail. The panel shares the earthquake/CCTV theme and sidebar switching behaviour. Hotspots default to enabled for new browsers. The marker switch is saved in localStorage and restored before polling starts on reload. Polling only runs while enabled, every ten minutes in recent mode.

## Sources

| Provider | Integration | Credentials |
| --- | --- | --- |
| NASA FIRMS | MODIS and VIIRS S-NPP / NOAA-20 / NOAA-21, coordinates and history | Free MAP_KEY |
| SIPONGI | Public GeoJSON endpoint used by its map, NASA/BRIN detections and administrative names | None for the current public endpoint |
| BMKG | Intact latest hotspot image, including its logo and attribution | None |

SIPONGI's web endpoint is not a documented stable public API contract. Failures are reported per provider. BMKG's archive dashboard returned HTTP 403 during integration; no access restrictions were bypassed. Its image is shown separately and does not follow the history slider. If the image service is unreachable, the panel retains a link to the official page and shows an unavailable message.

FIRMS documentation: https://firms.modaps.eosdis.nasa.gov/api/area

Free key registration: https://firms.modaps.eosdis.nasa.gov/api/map_key/

SIPONGI reference: https://sipongi.gakkum.kehutanan.go.id/peta

BMKG reference: https://www.bmkg.go.id/cuaca/satelit/polar-hotspot

## CMS and deployment

1. Run `npm run db:migrate` before deploying this version (migration 003).
2. Sign in as superadmin, open **CMS → Hotspot Sources / Sumber Hotspot**.
3. Enter the FIRMS MAP_KEY, then Save and Check. Empty input preserves the stored key; a separate checkbox removes it.
4. Enable/disable the known providers independently. Public providers do not accept unnecessary credentials.

Only superadmin can read/change/check source settings. Other roles receive 403 and guests 401. API keys are encrypted with AES-256-GCM in PostgreSQL, bound to their provider ID, and never returned by any endpoint. Audits record provider IDs, not credentials. Endpoints are fixed in the adapters, not arbitrary CMS URLs, to avoid turning the backend into a request proxy.

Set `JEJAK_SOURCE_SECRET_KEY` to a securely generated 32-byte hex encryption key on deployment, or persist the generated `.runtime/source-secret.key` across restarts. Keep that key with protected backups separately from the database. Changing or losing it requires re-entering stored provider credentials. Do not commit either API keys or the encryption key. Multiple application instances must share the same encryption key.

Redis uses `JEJAK_REDIS_URL` and the `jejak:hotspots:v1:` namespace. Results live for seven days; recent source responses refresh after five minutes, older data after one day. A bounded memory cache maintains functionality if Redis is unavailable; API responses identify which cache is in use. Concurrent identical requests share work inside a process, with a maximum of three provider/day jobs. Provider failures are briefly cached to avoid request storms; previously fetched data can be returned explicitly as stale.

## History and interpretation

- Up to 31 UTC calendar days per search. Recent windows use the last 24/48 hours or seven days.
- History loads sequentially by day, with progress based on completed days, not guessed upstream percentages.
- Play/pause and the slider filter already loaded data. Per-day and accumulated modes are supported.
- Cancelling retains completed days. Source outages, missing keys and missing satellite archive coverage remain visible rather than being reported as confirmed zero fires.
- FIRMS product availability is checked before selecting standard processing or near-real-time data. Archive coverage varies by satellite; prelaunch dates have no data.
- A polygon filter limits detections to the existing Indonesia land boundary dataset. Small islands/coastal points may be affected by that dataset's precision; no ocean-wide or neighbouring-country coverage is implied.
- Deduplication only merges matching satellite, UTC minute and coordinates rounded to four decimal places. The originating providers are retained. Ambiguous satellite identities and separate overpasses remain separate detections. Counts are **detections**, not unique or confirmed fires.
- Time in marker details follows the browser timezone; the timeline explicitly uses UTC.

## Checks

`npm test -- test/hotspots.test.mjs` covers normalization, geometry, archive selection, encryption, role access, secret redaction, cache reuse and disabled providers.

`npx playwright test test/browser/hotspots.spec.ts` covers date loading, timeline filtering, popup, responsive sidebar positioning, source errors and CMS credential editing with mocked upstream responses.
