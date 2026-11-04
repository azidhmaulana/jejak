# Garut CCTV source

- Provider: DISKOMINFO GARUT.
- Province/city: Jawa Barat / Kabupaten Garut.
- Public source: https://www.garutkab.go.id/cctv
- Retrieved: 2026-11-04 (Asia/Jakarta).
- Imported: 16 unique records from the page's public Nuxt payload, with publisher camera IDs, coordinates and HLS URLs.
- The search-index page text previously advertised 17 points; only the 16 actual records available in the retrieved payload are imported. The Diskominfo portal is not imported separately, avoiding an unverified duplicate catalog.
- All 16 passed the application's playlist-and-segment health probe during integration. This is a point-in-time result; the runtime health monitor determines subsequent status.

Garut is included in the server catalog, map/dock, source Active control, region filters, route matching, media proxy and health probes. The media proxy accepts only the catalog's HTTPS origin and each camera's own stream folder. No arbitrary URL proxy or provider credentials are used.

Camera status supplied by the publisher is not copied as verified online status. Source activation is an application visibility setting; it does not revoke public access to the provider's own website.
