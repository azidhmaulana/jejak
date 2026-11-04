import {
  Map as MapLibreMap,
  Popup,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from 'maplibre-gl';
import { cameraAvailability, type SurveillanceSource } from './osintSurveillanceStore';
import { getLanguage } from '../../shared/i18n/runtime.js';

const SOURCE = 'jejak-cameras';
const POINTS = `${SOURCE}-points`;
const SELECTED = `${SOURCE}-selected`;

/** GPU-rendered dots retain each camera's status without DOM markers or clustering. */
export function createCameraMapLayer(
  map: MapLibreMap,
  cameras: () => SurveillanceSource[],
  selected: () => string | null,
  onSelect: (id: string) => void,
) {
  let disposed = false;
  const popup = new Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 10,
    className: 'camera-map-tooltip',
  });
  const data = (): GeoJSON.FeatureCollection<GeoJSON.Point> => ({
    type: 'FeatureCollection',
    features: cameras().map((camera) => ({
      type: 'Feature',
      id: camera.id,
      geometry: { type: 'Point', coordinates: [camera.longitude, camera.latitude] },
      properties: { id: camera.id, name: camera.name, status: cameraAvailability(camera).status },
    })),
  });
  const select = (id: string | null) => {
    if (map.getLayer(SELECTED)) map.setFilter(SELECTED, ['==', ['get', 'id'], id || '']);
  };
  const install = () => {
    if (disposed || !map.getStyle()?.layers) return;
    if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: 'geojson', data: data() });
    if (!map.getLayer(POINTS)) {
      map.addLayer({
        id: POINTS,
        type: 'circle',
        source: SOURCE,
        paint: {
          'circle-radius': 5,
          'circle-color': [
            'match',
            ['get', 'status'],
            'online',
            '#4ce878',
            'offline',
            '#e76060',
            '#6a9aa7',
          ],
          'circle-stroke-color': '#143c28',
          'circle-stroke-width': 1.5,
        },
      });
      map.addLayer({
        id: SELECTED,
        type: 'circle',
        source: SOURCE,
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-radius': 8,
          'circle-opacity': 0,
          'circle-stroke-color': '#c1ef94',
          'circle-stroke-width': 2,
        },
      });
    }
    select(selected());
  };
  const refresh = () => {
    popup.remove();
    (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(data());
    select(selected());
  };
  const click = (event: MapLayerMouseEvent) => {
    const id = event.features?.[0]?.properties.id;
    if (id) onSelect(String(id));
  };
  const hover = (event: MapLayerMouseEvent) => {
    const properties = event.features?.[0]?.properties;
    if (!properties) return;
    map.getCanvas().style.cursor = 'pointer';
    const status =
      properties.status === 'online'
        ? 'Online'
        : properties.status === 'offline'
          ? 'Offline'
          : getLanguage() === 'en'
            ? 'Unverified'
            : 'Belum terverifikasi';
    popup.setLngLat(event.lngLat).setText(`${properties.name} - ${status}`).addTo(map);
  };
  const leave = () => {
    popup.remove();
    map.getCanvas().style.cursor = '';
  };
  let raising = false;
  const keepAboveRoads = () => {
    if (raising || disposed) return;
    const layers = map.getStyle()?.layers || [];
    const road = layers.findIndex((layer) => layer.id === 'jejak-road-reference');
    const point = layers.findIndex((layer) => layer.id === SELECTED);
    if (point < 0 || road <= point) return;
    raising = true;
    map.moveLayer(POINTS);
    map.moveLayer(SELECTED);
    raising = false;
  };
  map.on('styledata', keepAboveRoads);
  map.on('style.load', install);
  map.on('click', POINTS, click);
  map.on('mousemove', POINTS, hover);
  map.on('mouseleave', POINTS, leave);
  install();
  return {
    refresh,
    select,
    destroy: () => {
      disposed = true;
      leave();
      map.off('styledata', keepAboveRoads);
      map.off('style.load', install);
      map.off('click', POINTS, click);
      map.off('mousemove', POINTS, hover);
      map.off('mouseleave', POINTS, leave);
      for (const id of [SELECTED, POINTS]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    },
  };
}
