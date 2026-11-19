# Infra detail delivery

Infra now uses RAMMB/CIRA SLIDER Himawari full-disk Band 13 PNG tiles, native 2 km (level 3). Navigation uses the published sector parameters, ellipsoidal Earth and geostationary scan angles. JEJAK reprojects on demand to Web Mercator 512px PNG tiles, levels 3 through 8. Closer map zooms interpolate these tiles; no extra sensor detail is claimed.

Only frames present in the JMA recent manifest are accepted. Source level is min(native level, z-1), avoiding the earlier unnecessary downsampling at regional zooms. The exact timestamp is requested from CIRA; no nearest-frame or fabricated replacement. If a published tile fails to load, the client retains the previous successfully displayed frame and exposes a tile error. Blue now uses CIRA GeoColor, native level 4 (approximately 1 km), with its day/night composite. The client requests /frames?detail=1; this intersects the JMA timeline with both CIRA manifests so both products share actual available timestamps.

Decoded source cache: 64 MiB / 256 entries, 30 minutes. Failed source tiles: 30 seconds. In-flight source requests coalesce, max 64, using the shared eight-download semaphore. Output cache shares the existing 32 MiB / 1200-entry cache. HTTP PNG cache: 30 minutes. Coordinates and frame IDs are allowlisted before fetching. Source images are limited to 2.5 MB and 688x688 pixels.

References: https://slider.cira.colostate.edu/ and its published sector metadata. Infra enhancement palette is CIRA's, so it differs from the earlier JMA SND composite. Neither this layer nor its colour palette represents radar rainfall.


## Preparation and display (2026-11-18)

When the detailed timeline is requested, a single background job prepares both products for the default Indonesia view (z4, x12-14, y7-8). Work is sequential, coalesces with normal requests, skips under foreground pressure and abandons obsolete frames. It is demand-triggered, not an always-running polling service. Memory caches are not persistent across restarts.

After the selected product loads, the browser prepares the alternate product for the same frame in a hidden raster layer. No speculative preload during playback, hidden-tab operation or Save-Data mode. The existing four-source bound remains. A ready alternate switches using its loaded tiles. First visits, changed viewports and uncached frames can still require network loading.

Projection coordinates are reused across frames in a bounded 12-entry geometry cache (~24 MiB). PNG remains lossless, with compression level 3 for lower encoding cost. A mild luminance sharpening pass (Sharp sigma 0.5, m1 0.2, m2 0.4) compensates for projection softening; it is display enhancement, not increased sensor resolution. Output cache version 3 prevents serving older renders.


## Pixel fidelity correction

The display sharpening pass was removed. Detailed raster layers use nearest-neighbour display sampling to avoid a second blur in the browser. Server reprojection preserves source samples at close zoom (Infra z7+, GeoColor z8+) instead of blending the provider palette. Regional reprojection still uses bilinear sampling. Cache version 4 invalidates sharpened renders. This preserves displayed source pixels; it does not increase sensor resolution or undo the provider's own processing.


## Close zoom display correction (v5)

The nearest-neighbour experiment made source pixels visibly blocky and has been removed. Both reprojection and browser scaling now use linear interpolation, with no sharpening. Cache version 5 invalidates the blocky renders. This reduces jagged pixel boundaries; close zoom still cannot expose detail absent from the infrared sensor.


## Temperature-first Infra (v6)

Infra now reads NOAA public Himawari-9 Band 13 HSD BZip2 segments. Header gain/offset convert counts to radiance, then the Planck function and header correction produce brightness temperature. Geostationary navigation maps Mercator pixels to observations; bilinear temperature interpolation precedes the JEJAK palette. No RGB sharpening, AI upscaling or invented cloud detail. Native nadir resolution remains approximately 2 km.

Blue keeps CIRA GeoColor. The latest timeline checks that all ten raw segments exist; missing tiles fail without substituting a different observation. Older frames are fetched at their exact timestamps. HSD decompression runs in at most two bounded workers, decoded segments have a 96 MiB cache, and rendered tiles use the existing bounded cache/prewarm. First loads still depend on source/download speed; this is heavier than downloading pre-rendered PNGs. Client tile waits allow 30 seconds.

Palette is JEJAK-specific, not Windy's proprietary implementation: kelvin anchors are in server/himawari-hsd.mjs. Missing pixels remain transparent. HSD format: https://www.data.jma.go.jp/mscweb/en/himawari89/space_segment/hsd_sample/HS_D_users_guide_en_v13.pdf ; source: https://registry.opendata.aws/noaa-himawari/ .
