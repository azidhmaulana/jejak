# Access-control audit — 3 November 2026

Scope: Guest, Viewer, Operator, Admin and Super Admin; direct HTTP access, role escalation, account-owned routes/preferences, logout/revocation, and client state. Tests use isolated temporary accounts, never the live account database.

## Findings and remediation

1. **Critical development file exposure:** unauthenticated requests to `/.runtime/setup-token.txt` and `/.runtime/accounts.sqlite` returned HTTP 200 from Vite. Runtime files, databases including WAL/SHM, environment files, keys and Git metadata are now denied. Regression checks include encoded paths, uppercase directory names, `?raw`, `?url` and `/@fs/`. Retested requests return 403. Production static serving also rejects the tested private paths (404). This finding establishes exposure, not evidence of third-party access. If the development server was previously reachable by untrusted clients, treat downloaded database/password hashes as potentially compromised and rotate affected credentials. Vite configuration reference: [server.fs.deny](https://vite.dev/config/server-options.html#server-fs-deny).
2. **Unauthenticated internal map data:** project and image-overlay reads previously bypassed permission checks. GET/HEAD now require `objects.write`, just like mutations. Responses are not cached. Guest/Viewer cannot retrieve internal objects or overlays.
3. **Delegated permission escalation:** an Admin granted `roles.manage` could previously create permissions beyond their own. Non-super administrators can now edit only roles within their current permissions and grant only permissions they hold.
4. **Hidden account enumeration:** direct updates targeting Super Admin now return the same 404 as a nonexistent user. User/role lists exclude Super Admin; creating or assigning this role remains prohibited through CMS APIs.
5. **Client residue:** private drawings are no longer persisted to shared browser localStorage. Old drawing cache keys are retired, in-memory drawing state is cleared on logout/account changes, overlays are cleared, and delayed overlay/route/CMS responses cannot populate another account's state. The API remains authoritative. Unsynced in-memory drawing changes do not survive a page reload; wait for successful server sync before reloading.
6. **Public map metadata:** public catalog responses use an allowlist of display fields. Download jobs, queues, diagnostics, arbitrary source URLs and unknown future fields are not exposed to non-managers. Basemap tiles and public display metadata remain public by design.
7. **Malformed Origin:** malformed/cross-site Origins on writes now return 403 instead of throwing a server error.

## Default access matrix

| Role | Public map/CCTV | Own routes and preferences | Shared internal objects/overlays | CMS users | Edit role permissions | Offline map management |
| --- | --- | --- | --- | --- | --- | --- |
| Guest | Yes | No | No | No | No | No |
| Viewer | Yes | Yes | No | No | No | No |
| Operator | Yes | Yes | Yes | No | No | No |
| Admin | Yes | Yes | Yes | Yes, bounded by own permissions | No by default | Yes |
| Super Admin | Yes | Yes | Yes | Yes, hidden account excluded | Yes | Yes |

Routes/preferences are account-owned even for Admin/Super Admin: administrators cannot list or delete another account's saved route through the route API. Objects/overlays are one shared workspace for permitted roles, not per-operator records. Permission edits can change the defaults above; CMS also requires the Admin/Super Admin role explicitly.

## Verification

- `npm test`: 34 passing tests, including real API requests for every role, GET/HEAD/mutations, ownership spoofing, cross-account route deletion, hidden Super Admin, delegated escalation, live permission revocation, disabled accounts, replayed logout cookies, and malformed/cross-site Origins.
- `npm run test:browser`: 14 passing browser tests, including private-file denial, drawing persistence on server, actual logout clearing private drawing state, guest access, Viewer routing, registration and CMS behavior.
- `npm run build`: passed; existing large-bundle advisory remains.
- `npm audit --json`: zero reported vulnerabilities at audit time.

This is a targeted application audit, not an exhaustive penetration test. Existing CCTV catalogs are public assets; private CCTV sources must not be added there without a separate server-side access model. No claim is made about historical access, external deployment configuration, or untested attack classes. Backend permission revocation applies on the next request; client session polling can take up to 60 seconds to reflect a remote change visually.
