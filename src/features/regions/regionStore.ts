import { readLocalToggle, persistLocalToggle } from '../../shared/stores/localToggle';
import { create } from 'zustand';
import { containsPoint, provinceBounds, type Province } from './geometry';
import type { SurveillanceSource } from '../surveillance/osintSurveillanceStore';
export const useRegion = create<{
  provinces: Province[];
  country: Province | null;
  selected: string;
  showBoundary: boolean;
  loading: boolean;
  error: boolean;
}>(() => ({
  provinces: [],
  country: null,
  selected: '',
  showBoundary: readLocalToggle('jejak-boundary-enabled', true),
  loading: false,
  error: false,
}));
let pending: Promise<void> | null = null;
export function loadProvinces() {
  if (useRegion.getState().provinces.length) return Promise.resolve();
  if (pending) return pending;
  useRegion.setState({ loading: true, error: false });
  pending = Promise.all(
    ['/data/indonesia-provinces.geojson', '/data/indonesia-boundary.geojson'].map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Boundary load failed');
      return response.json();
    }),
  )
    .then(([data, country]) => {
      if (
        country.type !== 'Feature' ||
        !['Polygon', 'MultiPolygon'].includes(country.geometry?.type)
      )
        throw new Error('Invalid national boundary');
      if (
        data.type !== 'FeatureCollection' ||
        data.features.length !== 38 ||
        data.features.some(
          (f: Province) =>
            !f.properties.PROVINSI || !['Polygon', 'MultiPolygon'].includes(f.geometry.type),
        )
      )
        throw new Error('Invalid boundaries');
      useRegion.setState({
        country,
        provinces: data.features.sort((a: Province, b: Province) =>
          a.properties.PROVINSI.localeCompare(b.properties.PROVINSI),
        ),
      });
    })
    .catch(() => {
      useRegion.setState({ error: true });
    })
    .finally(() => {
      pending = null;
      useRegion.setState({ loading: false });
    });
  return pending;
}
const cache = new WeakMap<SurveillanceSource, { key: string; province: string }>();
export function cameraProvince(camera: SurveillanceSource, provinces: Province[]) {
  if (!provinces.length) return '';
  const key = `${camera.longitude},${camera.latitude},${camera.province || ''}`;
  const cached = cache.get(camera);
  if (cached?.key === key) return cached.province;
  let name = '';
  if (typeof camera.longitude === 'number' && typeof camera.latitude === 'number') {
    const x = camera.longitude,
      y = camera.latitude;
    name =
      provinces.find((p) => {
        const b = provinceBounds(p);
        return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && containsPoint(p, x, y);
      })?.properties.PROVINSI || '';
  }
  if (!name && camera.province)
    name =
      provinces.find((p) => p.properties.PROVINSI.toLowerCase() === camera.province?.toLowerCase())
        ?.properties.PROVINSI || '';
  cache.set(camera, { key, province: name });
  return name;
}
export function matchesProvince(
  camera: SurveillanceSource,
  selected: string,
  provinces: Province[],
) {
  return !selected || cameraProvince(camera, provinces) === selected;
}

persistLocalToggle(useRegion, 'showBoundary', 'jejak-boundary-enabled');

const pointCache = new WeakMap<object, { provinces: Province[]; lat: number; lng: number; name: string }>();
export function pointProvince(point: { lat: number; lng: number }, provinces: Province[]) {
  const cached = pointCache.get(point);
  if (cached?.provinces === provinces && cached.lat === point.lat && cached.lng === point.lng) return cached.name;
  const name = provinces.find(p => {
    const b = provinceBounds(p);
    return point.lng >= b[0] && point.lng <= b[2] && point.lat >= b[1] && point.lat <= b[3] && containsPoint(p, point.lng, point.lat);
  })?.properties.PROVINSI || '';
  pointCache.set(point, { provinces, lat: point.lat, lng: point.lng, name });
  return name;
}
export function filterRegionPoints<T extends { lat: number; lng: number }>(items: T[], region = useRegion.getState()): T[] {
  return region.selected ? items.filter(item => pointProvince(item, region.provinces) === region.selected) : items;
}
