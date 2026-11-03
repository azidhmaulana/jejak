import { useEffect } from 'react';
import type { Map, StyleSpecification, VectorSourceSpecification } from 'maplibre-gl';

/** Optional reference roads from an active local OpenMapTiles package. */
export default function RoadReferenceLayer({
  map,
  enabled,
  onAvailability,
}: {
  map: Map | null;
  enabled: boolean;
  onAvailability: (available: boolean) => void;
}) {
  useEffect(() => {
    if (!map || !enabled) return;
    const abort = new AbortController();
    let source: VectorSourceSpecification | undefined;
    const install = () => {
      if (!source || !map.getStyle()?.layers || abort.signal.aborted) return;
      if (!map.getSource('jejak-road-reference')) map.addSource('jejak-road-reference', source);
      if (!map.getLayer('jejak-road-reference'))
        map.addLayer(
          {
            id: 'jejak-road-reference',
            type: 'line',
            source: 'jejak-road-reference',
            'source-layer': 'transportation',
            filter: [
              'match',
              ['get', 'class'],
              ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'],
              true,
              false,
            ],
            paint: {
              'line-color': '#86b985',
              'line-opacity': 0.6,
              'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.3, 12, 0.8, 16, 2],
            },
            layout: { 'line-join': 'round', 'line-cap': 'round' },
          },
          map.getStyle().layers?.find((layer) => layer.id.startsWith('bms-drawing'))?.id,
        );
    };
    async function load() {
      try {
        const catalog = await fetch('/api/offline-maps/regions', { signal: abort.signal }).then(
          (response) => response.json(),
        );
        if (!catalog.activeByProvider?.openmaptiles) {
          onAvailability(false);
          return;
        }
        const response = await fetch('/offline-maps/style.json?provider=openmaptiles', {
          signal: abort.signal,
        });
        if (!response.ok) throw Error('Unavailable');
        const style = (await response.json()) as StyleSpecification;
        const candidate = Object.values(style.sources).find((item) => item.type === 'vector');
        if (!candidate || candidate.type !== 'vector') throw Error('No vector source');
        source = candidate;
        onAvailability(true);
        install();
      } catch {
        if (!abort.signal.aborted) onAvailability(false);
      }
    }
    void load();
    map.on('style.load', install);
    return () => {
      abort.abort();
      map.off('style.load', install);
      if (map.getLayer('jejak-road-reference')) map.removeLayer('jejak-road-reference');
      if (map.getSource('jejak-road-reference')) map.removeSource('jejak-road-reference');
    };
  }, [map, enabled, onAvailability]);
  return null;
}
