import { useEffect } from 'react';
import type { Map } from 'maplibre-gl';
import { loadProvinces, useRegion } from './regionStore';
import { provinceBounds } from './geometry';
export default function ProvinceLayer({ map }: { map: Map | null }) {
  const { selected, provinces, country, showBoundary } = useRegion();
  const feature = provinces.find((p) => p.properties.PROVINSI === selected);
  const boundary = selected ? feature : country;
  useEffect(() => {
    void loadProvinces();
  }, []);
  useEffect(() => {
    if (!map || !feature) return;
    const b = provinceBounds(feature);
    map.fitBounds(
      [
        [b[0], b[1]],
        [b[2], b[3]],
      ],
      {
        padding: {
          top: 100,
          bottom: 90,
          left: map.getCanvas().clientWidth > 700 ? 450 : 55,
          right: 55,
        },
        maxZoom: 12,
        duration: 700,
      },
    );
  }, [map, feature]);
  useEffect(() => {
    if (!map || !boundary || !showBoundary) return;
    const source = 'jejak-province';
    const draw = () => {
      if (!map.isStyleLoaded()) return;
      if (!map.getSource(source)) map.addSource(source, { type: 'geojson', data: boundary });
      const before = map.getLayer('jejak-cameras-points') ? 'jejak-cameras-points' : undefined;
      if (selected && !map.getLayer(source + '-fill'))
        map.addLayer(
          {
            id: source + '-fill',
            type: 'fill',
            source,
            paint: { 'fill-color': '#7ee653', 'fill-opacity': selected ? 0.055 : 0 },
          },
          before,
        );
      if (!map.getLayer(source + '-line'))
        map.addLayer(
          {
            id: source + '-line',
            type: 'line',
            source,
            paint: { 'line-color': '#93ee55', 'line-width': 2, 'line-opacity': 0.9 },
          },
          before,
        );
    };
    draw();
    map.on('styledata', draw);
    map.on('idle', draw);
    return () => {
      map.off('styledata', draw);
      map.off('idle', draw);
      for (const id of [source + '-line', source + '-fill'])
        if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(source)) map.removeSource(source);
    };
  }, [map, boundary, selected, showBoundary]);
  return null;
}
