import { useEffect, useState } from 'react';
import type { Map, GeoJSONSource } from 'maplibre-gl';
import { distanceMeters, formatDistance } from '../../../modules/drawing/mapMeasurements';
import { useLanguage } from '../../../shared/i18n/useLanguage';

export default function QuickMeasure({ map, onClose }: { map: Map; onClose: () => void }) {
  const en = useLanguage() === 'en';
  const [points, setPoints] = useState<[number, number][]>([]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onClose]);
  useEffect(() => {
    const canvas = map.getCanvas();
    const cursor = canvas.style.cursor;
    canvas.style.cursor = 'crosshair';
    const click = (event: MouseEvent) => {
      event.stopImmediatePropagation(); event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const point = map.unproject([event.clientX - rect.left, event.clientY - rect.top]);
      setPoints(values => [...values, [point.lng, point.lat]]);
    };
    const doubleClick = (event: MouseEvent) => { event.stopImmediatePropagation(); event.preventDefault(); };
    canvas.addEventListener('click', click, true);
    canvas.addEventListener('dblclick', doubleClick, true);
    return () => { canvas.style.cursor = cursor; canvas.removeEventListener('click', click, true); canvas.removeEventListener('dblclick', doubleClick, true); };
  }, [map]);
  useEffect(() => {
    const render = () => {
      if (!map.getStyle()?.layers) return;
      if (!map.getSource('quick-measure')) map.addSource('quick-measure', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      if (!map.getLayer('quick-measure-line')) map.addLayer({ id: 'quick-measure-line', source: 'quick-measure', type: 'line', filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#a5ef75', 'line-width': 2, 'line-dasharray': [3, 2] } });
      if (!map.getLayer('quick-measure-points')) map.addLayer({ id: 'quick-measure-points', source: 'quick-measure', type: 'circle', filter: ['==', '$type', 'Point'], paint: { 'circle-color': '#a5ef75', 'circle-radius': 4, 'circle-stroke-color': '#102b18', 'circle-stroke-width': 2 } });
      (map.getSource('quick-measure') as GeoJSONSource).setData({ type: 'FeatureCollection', features: [
        ...points.map(point => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: point } })),
        ...(points.length > 1 ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: points } }] : []),
      ] });
    };
    render(); map.on('style.load', render);
    return () => { map.off('style.load', render); };
  }, [map, points]);
  useEffect(() => () => {
    for (const id of ['quick-measure-points', 'quick-measure-line']) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource('quick-measure')) map.removeSource('quick-measure');
  }, [map]);
  const distance = points.slice(1).reduce((sum, point, i) => sum + distanceMeters(points[i], point), 0);
  return <section className="quick-measure" aria-label={en ? 'Distance measurement' : 'Pengukuran jarak'}>
    <strong>{en ? 'Measure distance' : 'Ukur jarak'}</strong>
    <p>{en ? 'Click points on the map. Straight-line distance, not a road route.' : 'Klik titik di peta. Jarak garis lurus, bukan rute jalan.'}</p>
    <output>{points.length} {en ? 'points' : 'titik'} · {formatDistance(distance)}</output>
    <div><button disabled={!points.length} onClick={() => setPoints(p => p.slice(0, -1))}>{en ? 'Undo' : 'Urungkan'}</button><button disabled={!points.length} onClick={() => setPoints([])}>{en ? 'Clear' : 'Bersihkan'}</button><button onClick={onClose}>{en ? 'Done' : 'Selesai'}</button></div>
  </section>;
}
