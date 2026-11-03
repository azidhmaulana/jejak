import type { Drawing } from './mapToolsStore';

const radians = (degrees: number) => (degrees * Math.PI) / 180;
export function distanceMeters(a: number[], b: number[]) {
  const lat = radians(b[1] - a[1]),
    lng = radians(b[0] - a[0]);
  const hav =
    Math.sin(lat / 2) ** 2 +
    Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(lng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, hav))));
}
export function measureDrawing(feature?: Drawing): { label: string; meters: number } | null {
  if (!feature) return null;
  if (feature.geometry.type === 'LineString') {
    const points = feature.geometry.coordinates;
    return {
      label: 'Jarak',
      meters: points.slice(1).reduce((sum, point, i) => sum + distanceMeters(points[i], point), 0),
    };
  }
  if (feature.geometry.type !== 'Polygon') return null;
  const ring = feature.geometry.coordinates[0] || [];
  if (ring.length < 3) return null;
  if (feature.properties.mode === 'rectangle')
    return { label: 'Sisi', meters: distanceMeters(ring[0], ring[1]) };
  if (feature.properties.mode === 'circle') {
    const points = ring.slice(0, -1);
    // Spherical centroid also works for circles crossing the date line.
    const vector = points.reduce(
      (v, [lng, lat]) => [
        v[0] + Math.cos(radians(lat)) * Math.cos(radians(lng)),
        v[1] + Math.cos(radians(lat)) * Math.sin(radians(lng)),
        v[2] + Math.sin(radians(lat)),
      ],
      [0, 0, 0],
    );
    const center = [
      (Math.atan2(vector[1], vector[0]) * 180) / Math.PI,
      (Math.atan2(vector[2], Math.hypot(vector[0], vector[1])) * 180) / Math.PI,
    ];
    return {
      label: 'Radius',
      meters: Math.max(...points.map((point) => distanceMeters(center, point))),
    };
  }
  if (feature.properties.mode === 'polygon')
    return {
      label: 'Keliling',
      meters: ring.slice(1).reduce((sum, point, i) => sum + distanceMeters(ring[i], point), 0),
    };
  return null;
}
export const formatDistance = (meters: number) =>
  meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters.toFixed(1)} m`;
export function drawingCursorMeasurement(feature: Drawing | null): string {
  if (!feature) return '';
  if (feature.properties.mode === 'rectangle' && feature.geometry.type === 'Polygon') {
    const ring = feature.geometry.coordinates[0];
    if (!ring || ring.length < 3) return '';
    return `${formatDistance(distanceMeters(ring[0], ring[1]))} × ${formatDistance(distanceMeters(ring[1], ring[2]))}`;
  }
  const measurement = measureDrawing(feature);
  if (!measurement || !Number.isFinite(measurement.meters)) return '';
  return formatDistance(measurement.meters);
}
export function parseCoordinates(value: string): [number, number] | null {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]),
    lng = Number(match[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lng, lat] : null;
}
