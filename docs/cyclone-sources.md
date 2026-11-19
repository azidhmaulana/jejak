# Cyclone sources

Checked 2026-11-17. Current-position aggregation is separate from forecast model tracks.

## Connected

- JTWC: https://www.metoc.navy.mil/jtwc/rss/jtwc.rss and linked warning text. Pacific/Indian coverage; 1-minute wind. Excludes final warnings. Invests are loaded separately from abioweb.txt and abpwweb.txt, with LOW/MEDIUM/HIGH development potential, exact wind ranges, and bulletin issue time. Promoted systems and previous-only positions are excluded.
- NOAA/NHC: https://www.nhc.noaa.gov/CurrentStorms.json. Atlantic/east/central Pacific. Uses current numeric coordinates, lastUpdate and intensity (knots, 1-minute). Includes TD/TS/HU/SD/SS; excludes potential, remnant and extratropical systems.
- JMA: https://www.jma.go.jp/bosai/typhoon/data/targetTc.json and each allowlisted TC identifier's forecast.json. Uses only advancedHours=0, center [latitude, longitude], validtime.JST. Forecast points are never current markers. Shows JMA typhoon number; intensity remains unknown because this adapter does not ingest specification values. JMA wind convention is 10-minute, not JTWC's 1-minute.

Each provider runs independently, requests are coalesced and cached for ten minutes. A partial or unavailable provider is labelled in the panel. All-source failure returns 503 rather than a false empty list. Observations older than 36 hours are excluded. Per-provider counts precede deduplication.

Cross-provider observations within six hours are merged only when their match is unique in both directions: within 400 km for the same non-generic name, otherwise 150 km. This conservative heuristic can leave duplicates when agencies disagree materially; it deliberately avoids ambiguous merges. The latest report supplies position/intensity together, without averaging wind measurements. Provenance is retained. IDs are deterministic for an unchanged reporting set but can change if a contributing agency disappears.

Live verification: JTWC 2, NHC 0, JMA 0. Empty feeds are valid, not additional synthetic storms. JMA active observation parsing is fixture-tested against the analysis structure used by its official typhoon_map.js; no active JMA bulletin was available for live end-to-end verification.

## Not connected yet

- BoM: official CXML documentation https://www.bom.gov.au/cyclone/cxmlinfo/index.shtml returned HTTP 403 from this environment. No adapter is enabled without an accessible, verified product.
- IMD: https://api.imd.gov.in/api/v1/cyclone_track returned HTTP 401. Requires authorized API access. Documentation: https://api.imd.gov.in/public/api_reference.html. Do not place credentials in client code.
- UK Met Office: cyclone track service requires arranging access/delivery; the published datasheet describes a handling fee and FTP/email delivery. https://www.metoffice.gov.uk/api/assets/file/cyclone-tracks-datasheet?prefix=assets . No credentials or service subscription has been supplied.
- ECMWF: free open forecast tracks exist in BUFR. https://www.ecmwf.int/en/forecasts/datasets/open-data . Not integrated in this current-position adapter; needs a dedicated forecast decoder and track/model presentation. Forecast genesis must not inflate the count of observed active cyclones.

This is not yet source parity with Windy. Windy documents multiple forecast agencies/models: https://community.windy.com/topic/21556/new-windy-hurricane-tracker-2023 .

Invest integration verified against the JTWC advisory on 2026-11-17: 96S, 2.1 S / 91.5 E, MEDIUM, 28-33 kt. Advisory time is not a per-system observation time.
