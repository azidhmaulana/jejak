import { useEffect } from 'react';
import { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { useRoute } from './routeStore';
export default function RouteLayer({ map }: { map: MapLibreMap | null }) {
  const { result, picking, start, end } = useRoute();
  useEffect(() => {
    if (!map || !picking) return;
    const canvas = map.getCanvas(),
      previous = canvas.style.cursor;
    canvas.style.cursor = 'crosshair';
    const click = (event: any) => {
      useRoute.setState({
        [picking]: [event.lngLat.lng, event.lngLat.lat],
        picking: picking === 'start' ? 'end' : null,
        result: null,
        filter: false,
      });
    };
    map.on('click', click);
    return () => {
      canvas.style.cursor = previous;
      map.off('click', click);
    };
  }, [map, picking]);
  useEffect(() => {
    if (!map) return;
    const markers: Marker[] = [];
    for (const [label, point] of [
      ['A', start],
      ['B', end],
    ] as const)
      if (point) {
        const element = document.createElement('div');
        element.className = 'route-endpoint';
        element.textContent = label;
        markers.push(new Marker({ element }).setLngLat(point).addTo(map));
      }
    return () => markers.forEach((marker) => marker.remove());
  }, [map, start, end]);
  useEffect(() => {
    if (!map || !result) return;
    const draw = () => {
      if (!map.isStyleLoaded()) return;
      if (!map.getSource('jejak-route'))
        map.addSource('jejak-route', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: result.geometry },
        });
      if (!map.getLayer('jejak-route-halo'))
        map.addLayer({
          id: 'jejak-route-halo',
          type: 'line',
          source: 'jejak-route',
          paint: { 'line-color': '#05180d', 'line-width': 9 },
        });
      if (!map.getLayer('jejak-route-line'))
        map.addLayer({
          id: 'jejak-route-line',
          type: 'line',
          source: 'jejak-route',
          paint: { 'line-color': '#92f650', 'line-width': 4 },
        });
    };
    draw();
    map.on('styledata', draw);
    const points = result.geometry.coordinates;
    const lngs = points.map((p) => p[0]),
      lats = points.map((p) => p[1]);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 80, maxZoom: 16, duration: 700 },
    );
    return () => {
      map.off('styledata', draw);
      for (const id of ['jejak-route-line', 'jejak-route-halo'])
        if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource('jejak-route')) map.removeSource('jejak-route');
    };
  }, [map, result]);
  return null;
}
