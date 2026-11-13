import { create } from 'zustand';
import { useAuth } from '../auth/authStore';
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
  showBoundary: true,
  loading: false,
  error: false,
}));
let pending: Promise<void> | null = null;
useAuth.subscribe((state, previous) => {
  if (previous.user && !state.user) useRegion.setState({ selected: '', showBoundary: true });
});
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
