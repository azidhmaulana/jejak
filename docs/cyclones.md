# Current tropical cyclones

GET /api/weather/cyclones reads the public JTWC RSS and the warning text products
linked from it. Coverage: Pacific and Indian Oceans, not a global warning feed.
Only numbered cyclone warning products (numbers below 90) are included. Invests,
formation alerts, final warnings and archived cyclones are excluded in this phase.

The UI displays the WARNING POSITION analysis timestamp, not the forecast position.
Wind values are JTWC one-minute sustained wind and gusts in knots. Motion describes
the past six hours, not a forecast. Pressure is omitted because this bulletin field
is not consistently available. No inferred storm names or artificial paths.

Enabled layers refresh every 10 minutes while the page is visible. Server cache is
10 minutes with shared in-flight requests and 30-second failure backoff. Feed and
position timestamps older than 36 hours are rejected rather than shown as current.
Fetches have a 15-second timeout and 500 KB bound per bulletin, fixed provider URLs,
and at most 20 cyclone products per refresh. Source failure returns 503 rather than
an empty successful list. Historical tracking and forecast tracks are not included.

Sources:
- https://www.metoc.navy.mil/jtwc/rss/jtwc.rss
- https://www.metoc.navy.mil/jtwc/jtwc.html

Validation:
- node --test test/cyclones.test.mjs
- npx playwright test test/browser/cyclones.spec.ts
