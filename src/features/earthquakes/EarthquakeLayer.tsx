import { useRegion } from '../regions/regionStore';
import { useEffect } from 'react';
import type { Map as LibreMap, GeoJSONSource, MapMouseEvent } from 'maplibre-gl';
import EarthquakePopup from './EarthquakePopup';
import { useMapTools } from '../../modules/drawing/mapToolsStore';
import { useEarthquakes, visibleEarthquakes } from './earthquakeStore';

const radius = (m: number) => m < 5 ? 9 : 11 + Math.min(4, Math.floor(m) - 5) * 2;
const source = 'jejak-earthquakes', layer = 'jejak-earthquake-markers';
const halo = 'jejak-earthquake-pulse', labels = 'jejak-earthquake-magnitudes';
const selectionRing = 'jejak-earthquake-selected';
export default function EarthquakeLayer({ map }: { map: LibreMap | null }) {
  const region = useRegion();
  const state = useEarthquakes();
  const items = visibleEarthquakes(state, region);
  const pulseUntil = Math.max(0, ...items.map(q => q.time + (q.magnitude > 5 ? 48 : 24) * 3600000));
  useEffect(() => {
    if (!map) return;
    let installed = false;
    const render = () => {
      if (installed && map.getSource(source)) return;
      if (!map.getSource(source) && !map.getStyle()?.sources) return;
      installed = true;
      if (!map.getSource(source)) map.addSource(source, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      if (!map.getLayer(halo)) map.addLayer({ id: halo, type: 'circle', source, filter: ['>', ['get', 'pulseUntil'], Date.now()], paint: {
        'circle-radius': ['+', ['get', 'radius'], 2], 'circle-color': '#ff4b55', 'circle-opacity': 0,
      } });
      if (!map.getLayer(layer)) map.addLayer({ id: layer, type: 'circle', source, paint: {
        'circle-radius': ['get', 'radius'],
        'circle-color': '#c92e3c',
        'circle-stroke-width': ['case', ['==', ['get', 'id'], useEarthquakes.getState().selected?.id || ''], 3, 1.5],
        'circle-stroke-color': '#ff989f', 'circle-opacity': 1,
      } });
      if (!map.getLayer(selectionRing)) map.addLayer({
        id: selectionRing, type: 'circle', source,
        filter: ['==', ['get', 'id'], useEarthquakes.getState().selected?.id || ''],
        paint: {
          'circle-radius': ['+', ['get', 'radius'], 8],
          'circle-opacity': 0,
          'circle-stroke-color': '#ff4b55',
          'circle-stroke-width': 2,
        },
      });
      // Local label images also work on basemaps without a glyph service.
      for (const q of items) {
        const name = `quake-mag-${q.magnitude.toFixed(1)}`;
        if (map.hasImage(name)) continue;
        const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
        const context = canvas.getContext('2d');
        if (!context) continue;
        context.fillStyle = '#ffffff'; context.font = 'bold 16px sans-serif';
        context.textAlign = 'center'; context.textBaseline = 'middle';
        context.fillText(q.magnitude.toFixed(1), 32, 33);
        map.addImage(name, context.getImageData(0, 0, 64, 64), { pixelRatio: 2 });
      }
      if (!map.getLayer(labels)) map.addLayer({ id: labels, type: 'symbol', source, layout: {
        'icon-image': ['get', 'label'], 'icon-allow-overlap': true, 'icon-ignore-placement': true,
      } });
      (map.getSource(source) as GeoJSONSource).setData({ type: 'FeatureCollection', features: (state.enabled ? items : []).map(q => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [q.lng, q.lat] }, properties: { id: q.id, magnitude: q.magnitude, radius: radius(q.magnitude), pulseUntil: q.time + (q.magnitude > 5 ? 48 : 24) * 3600000, label: `quake-mag-${q.magnitude.toFixed(1)}` },
      })) });
      map.setPaintProperty(layer, 'circle-stroke-width', ['case', ['==', ['get', 'id'], useEarthquakes.getState().selected?.id || ''], 3, 1.5]);
    };
    const select = (event: MapMouseEvent) => {
      if (!['render', 'select'].includes(useMapTools.getState().mode)) return;
      if (!state.enabled || !map.getLayer(layer)) return;
      const id = map.queryRenderedFeatures(event.point, { layers: [layer] })[0]?.properties?.id;
      // Paint updates can briefly leave the rendered feature index empty. Match the visible marker radius as a fallback.
      const nearest = !id ? items.map(q => ({ quake: q, distance: map.project([q.lng, q.lat]).dist(event.point) }))
        .filter(q => q.distance <= radius(q.quake.magnitude) + 1).sort((a, b) => a.distance - b.distance)[0]?.quake : undefined;
      const quake = items.find(q => q.id === id) || nearest;
      if (quake) useEarthquakes.setState({ selected: quake });
    };
    map.on('style.load', render); map.on('sourcedata', render); map.on('idle', render); map.on('click', select);
    render();
    return () => { map.off('style.load', render); map.off('sourcedata', render); map.off('idle', render); map.off('click', select); };
  }, [map, state.enabled, state.mode, state.live, state.latest, state.history, region.selected, region.provinces]);
  useEffect(() => {
    if (map?.getLayer(layer)) map.setPaintProperty(layer, 'circle-stroke-width', ['case', ['==', ['get', 'id'], state.selected?.id || ''], 3, 1.5]);
    if (map?.getLayer(selectionRing)) map.setFilter(selectionRing, ['==', ['get', 'id'], state.selected?.id || '']);
  }, [map, state.selected]);
  useEffect(() => {
    if (!map || !state.enabled || pulseUntil <= Date.now()) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, last = 0;
    const animate = (time: number) => {
      if (time - last >= 65 && map.getLayer(halo)) {
        const progress = (time % 1800) / 1800;
        map.setPaintProperty(halo, 'circle-radius', ['+', ['get', 'radius'], motion.matches ? 2 : 1 + progress * 6]);
        map.setPaintProperty(halo, 'circle-opacity', motion.matches ? 0.16 : 0.35 * (1 - progress));
        last = time;
      }
      if (!motion.matches && !document.hidden && Date.now() < pulseUntil) frame = requestAnimationFrame(animate);
    };
    const restart = () => { cancelAnimationFrame(frame); if (!document.hidden) frame = requestAnimationFrame(animate); };
    const expiryTimer = window.setInterval(() => { if (map.getLayer(halo)) map.setFilter(halo, ['>', ['get', 'pulseUntil'], Date.now()]); }, 1000);
    restart(); document.addEventListener('visibilitychange', restart); motion.addEventListener('change', restart);
    return () => { clearInterval(expiryTimer); cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', restart); motion.removeEventListener('change', restart); };
  }, [map, state.enabled, pulseUntil]);
  useEffect(() => {
    if (map && state.selected && state.enabled) map.flyTo({ center: [state.selected.lng, state.selected.lat], zoom: Math.max(map.getZoom(), 7), duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900 });
  }, [map, state.selected, state.enabled]);
  useEffect(() => () => {
    for (const id of [labels, selectionRing, layer, halo]) if (map?.getLayer(id)) map.removeLayer(id);
    if (map?.getSource(source)) map.removeSource(source);
  }, [map]);
  return <EarthquakePopup map={map} quake={state.enabled && items.some(item => item.id === state.selected?.id) ? state.selected : null} />;
}
