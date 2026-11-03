# Accounts and CCTV routes

The public map and existing public CCTV catalogue remain accessible without login.
Public registration is available after initial administrator setup. Registered accounts always receive the Viewer role; any role or permissions supplied by the client are ignored. Admin and Super Admin can change roles through CMS; assigning Super Admin is prohibited.

## First administrator

1. Run `npm run dev` and open http://127.0.0.1:5173.
2. Open the account icon in the navbar.
3. Read `.runtime/setup-token.txt` on the server and enter that token in the setup form.
4. Choose your name, email, and a password of at least 12 characters.

Setup creates the first Super Admin and cannot be reused after an account exists.
Do not share the setup token or commit runtime files. Passwords are stored as salted
scrypt hashes. Sessions use random, hashed tokens and HttpOnly, SameSite=Strict cookies
with a 12-hour server expiry by default. Remember me extends the session and persistent cookie to 30 days. Without it, the cookie is a browser-session cookie. In production set `NODE_ENV=production` and use HTTPS for Secure cookies.

## Roles

| Role        | Default permissions                                         |
| ----------- | ----------------------------------------------------------- |
| Guest       | Public map and public CCTV; no account permissions          |
| Viewer      | `routes.use`, `routes.save`                                 |
| Operator    | Viewer permissions plus `objects.write`                     |
| Admin       | Operator permissions plus `users.manage`, `settings.manage` |
| Super Admin | All permissions, including `roles.manage`                   |

Account → Users creates users, changes roles and enables/disables accounts.
Super Admin can create/edit roles through Account → Roles & permissions.
Admin cannot assign privileges they do not possess. Account disabling and role changes
invalidate the affected user's sessions. Editing role permissions takes effect on the next
API request. Viewer has no report permission; the previous placeholder report button is removed.
Favorites and recent cameras are stored per account; Guest preferences remain in the browser.

Database and audit records live in `.runtime/accounts.sqlite` (or `JEJAK_DATA_DIR`).
Back up this directory consistently, including SQLite WAL files when the server is running.

## Routing

Sign in as Viewer or another role with `routes.use`, then select Route in the navbar.
Choose A and B by clicking the map, or enter `latitude, longitude` in each field.
Choose a 25, 50 or 100 meter corridor and select Find route.

The backend requests a driving route from OSRM and checks the shortest distance of each
public catalogue camera to the actual route segments. Results are ordered by distance
along the route; this does not establish the camera's viewing direction or road carriageway.
The map markers and camera dock can be filtered to the result. Clear removes the route/filter.
Saved routes contain endpoints and tolerance, belong to one user, and are recalculated when opened.
There is a limit of 100 saved routes per account.

`JEJAK_ROUTING_URL` configures the OSRM base URL; default is `https://routing.openstreetmap.de/routed-car`.
The default is an external public service, requires internet and may be unavailable. For sustained
deployment configure a dedicated OSRM instance. No straight-line fallback is presented as a road route.
Routing follows the [OSRM Route API](https://project-osrm.org/docs/v26.6.1/http.html).

This first version routes against the bundled public camera catalogue. Browser-only custom sources
are not sent to the routing server. A server-managed internal camera catalogue with region/group
assignments is not implemented here; do not place private camera data in the public bundled JSON.

## Verification

- `npm test`: authentication, permission changes, session revocation, preference isolation,
  route ownership, geometry matching and existing APIs.
- `npm run test:browser`: public workspace, Viewer sign-in, route filtering and saving.
- `npm run build`: TypeScript and production build.

The default routing provider is operated by FOSSGIS. The backend limits outgoing calculations to one per 1.1 seconds and supplies an application User-Agent. See [provider usage policy](https://routing.openstreetmap.de/about.html).

The signed-in account dropdown separates Profile, CMS, and Logout. CMS requires the Admin or Super Admin role on both client and server, even if another role is assigned a management permission. Admin can inspect role permissions; editing still requires `roles.manage`.

Login and registration use icon tabs and password visibility controls. Forgot password currently directs users to an administrator; email recovery is not configured. The Terms & Privacy control displays current data-use information.
