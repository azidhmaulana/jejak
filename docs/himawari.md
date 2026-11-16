# Himawari infrared layer

JEJAK uses JMA Himawari Band 13 infrared tiles for day/night cloud observations. Open Weather in the left sidebar (mobile: More → Weather), then enable Infrared clouds. The switch persists with the existing local weather preference. The layer is available to guests.

## Sources and attribution

- Viewer: https://www.jma.go.jp/bosai/map.html#contents=himawari
- Timeline: https://www.jma.go.jp/bosai/himawari/data/satimg/targetTimes_fd.json
- Tiles: fixed JMA satimg origin, `{basetime}/fd/{validtime}/B13/TBB/{z}/{x}/{y}.jpg`.
- JMA terms: https://www.data.jma.go.jp/mscweb/en/general/note.html

Public imagery is available without an API key. Attribution is displayed in the panel and map. JMA permits reuse including commercial use subject to its terms. Hosting and bandwidth are still application costs. This is an infrared observation overlay, not rainfall, a forecast, or a live video. Observation cadence is nominally ten minutes; actual frames can be missing or delayed. Public website endpoints have no availability guarantee.

## Time and map behavior

The timeline contains up to 37 available observations from the most recent six hours, with three/six-hour playback options. Labels use the client's timezone and distinguish requested time from the image actually loaded. Refresh checks every two minutes while enabled and the tab is visible. Playback stops on hidden tabs and waits for tile loading. Errors pause playback; Refresh permits another attempt.

JMA XYZ tiles use Web Mercator and have verified zoom levels 3–5. Higher map zooms overzoom imagery, without implying additional spatial detail. The overlay covers the Indonesian region within 80°E–180°E, 60°S–60°N. At most two frame sources exist: the displayed frame and its replacement. Vector markers remain above imagery. Style changes reinstall the active observation.

## Server boundaries and cache

`GET /api/weather/himawari/frames` and `/tiles/:frame/:z/:x/:y.jpg` proxy only fixed JMA URLs. Tile timestamps must exist in the current manifest; zoom and tile indices are validated. Redirects and arbitrary upstream URLs are not accepted. JPEG MIME and signature are checked, with bounded response sizes and a twelve-second upstream timeout.

The server uses a per-process memory cache (32 MiB / 1,200 tile entries maximum), 30-minute successful tile/browser caching, and 15-second negative tile caching. Manifest requests are coalesced and cached for sixty seconds; failures back off thirty seconds. Previously fetched metadata can be served stale for up to twelve hours, always with the original timestamp and a stale flag. Eight upstream tile requests run concurrently, with at most 48 unique in-flight/queued tiles. Existing API protections and a satellite request/concurrency limiter also apply. Restarting the process clears this cache; no PostgreSQL records or credentials are required.

## Daily history

Play daily advances from the selected date by one UTC day every 1.8 seconds, waiting for requests and tiles to finish. It stops at today, on source/tile errors, when clouds are disabled, or when the browser tab is hidden. Missing days remain visibly unavailable before advancing. Pause holds the selected date. Archive imagery is now displayed with MapLibre raster saturation -1 to remove the enhanced palette colors; this is a grayscale visualization, not a reconstruction of JMA's recent-image temperature transfer function, so contrast can differ.

Open Weather → Himawari → Daily history, choose a date, then Show. Dates use UTC and are bounded to one calendar month before today (clamped to the last day of the previous month when necessary). The displayed observation time uses the client's timezone. Show also enables clouds if disabled. Recent playback remains separate.

History uses the JMA Himawari Band 13 visualization distributed by NASA GIBS, not the short-lived JMA website tiles. One actual observation nearest 05:00 UTC (12:00 WIB) is selected within each requested UTC day; this is **not a daily average**. No frame from another day is substituted. Gaps return an explicit unavailable state and clear the previous image. GIBS uses an enhanced infrared palette, so cold cloud tops can have colors that differ from the recent JMA visualization.

- Documentation: https://nasa-gibs.github.io/gibs-api-docs/
- Metadata: https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml
- Layer: `Himawari_AHI_Band13_Clean_Infrared`, `GoogleMapsCompatible_Level6` (JEJAK requests zoom 3–5).
- API: `GET /api/weather/himawari/history?date=YYYY-MM-DD`; selected archive frame IDs begin with `h`.

Metadata determines actual available timestamps, is cached for ten minutes, coalesces concurrent requests, and backs off thirty seconds after failure. Archive PNG tiles share the bounded tile cache and concurrency controls; MIME and PNG signature are validated. Date bounds are checked on the server. Only fixed NASA GIBS URLs and allowlisted timestamps are proxied. No API key, Python worker, database migration, or extra service is needed. Availability depends on the upstream archive; caching does not guarantee permanent retention.

Attribution: imagery provided by NASA Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS), with Himawari observations from JMA. Attribution appears in both the panel and map.

## Validation

Tests cover timeline sanitization, caching/coalescing, stale expiry, invalid images/paths, bounded concurrency, animation, opacity, basemap restoration, persisted switches, source failure, and mobile layout. Live manifest and JPEG retrieval were also verified against JMA through the local JEJAK API.

History tests cover calendar-month validation, nearest observation selection within the same day, missing dates, fixed upstream paths, metadata/tile caching, switching recent/history, automatic enable, and mobile layout. An archive PNG for 2026-10-16 05:00 UTC was retrieved through the JEJAK router and visually checked.


## Visible / infrared automatic display

Recent imagery defaults to Auto: JMA B03/ALBD visible pixels in daylight,
B13/TBB infrared pixels at night. A solar-elevation mask calculated for each
pixel at the observation timestamp blends the two over 0?8 degrees of solar
elevation. This is a JEJAK composite, not Windy imagery or its proprietary BLUE
processing. Users can select visible-only or infrared-only. Opacity defaults
to 90%. This does not increase the native tile resolution.

Tile query: product=auto|visible|ir. The omitted product remains ir for backward
compatibility. Each product has an independent cache key. Both source channels
must load for Auto; a failure is reported, never silently replaced with another
observation time. Composition uses the sharp runtime dependency. Archive mode
remains hidden and infrared-only.
