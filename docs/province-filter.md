# Province filter

The Regions menu replaces Warnings. Selection filters active camera markers, previews, camera dock and navbar search. Counts include active configured sources; choosing a province clears route-only filtering and camera selection. Closing the panel preserves the filter; Clear filter restores all provinces. The highlighted navigation button indicates an active filter. Boundary visibility is independent of camera filtering.

Assignment uses camera coordinates against Polygon/MultiPolygon boundaries (including holes), then falls back to matching province metadata. Unknown coordinates/provinces are excluded only when a specific province is selected. Approximate camera positions and simplified boundaries are not authoritative. No camera coordinates are changed.

Data: [Indonesia-Geojson-2026, mashadinoor](https://github.com/mashadinoor/Indonesia-Geojson-2026), fork of Ardian Saputra Hasibuan's GeoJson-Indonesia-38-Provinsi, MIT license. Retrieved 2026-11-07 from Geojson/indonesia_provinsi.geojson. License retained at public/data/indonesia-provinces-LICENSE.txt. Vendored at public/data/indonesia-provinces.geojson; JSON whitespace compacted, geometry unchanged. Attribution is displayed in the panel. The upstream README credits BIG geometry and Kemendagri administrative codes; this is a visualization reference, not a legal boundary dataset. Geometry loads only when Regions is first opened and is cached for the session.

National boundary: `public/data/indonesia-boundary.geojson` is derived from the same licensed province dataset with Shapely make_valid + union_all (dissolve). All-provinces mode displays this country outline automatically on startup; selecting a province replaces it. No national fill and no startup camera movement are applied. The boundary toggle also controls the national outline.

National outline renders exterior rings only; interior rings are removed from the dissolved national asset. Province geometry remains unchanged. This follows land outlines, not a claimed maritime/EEZ boundary.

2026-11-09: All-provinces mode now uses BIG Peta Batas ZEE line features from public/data/indonesia-eez.geojson instead of land/coastline polygons. It has no polygon fill, no inferred connections, and retains source attributes including boundary status. Metadata/query/count are recorded in docs/indonesia-eez-source.json. UI labels this explicitly as EEZ, not territorial waters. Province selection/assignment remain based on land polygons.

2026-11-09 (reverted at user request): All-provinces mode again loads indonesia-boundary.geojson (exterior land rings only). EEZ assets remain archived but are not loaded or rendered.
