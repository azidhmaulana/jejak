import type { Feature, Polygon, MultiPolygon, Position } from 'geojson';
export type Province = Feature<Polygon | MultiPolygon, { PROVINSI: string }>;
const boundsCache = new WeakMap<Province, [number, number, number, number]>();
export function provinceBounds(feature: Province): [number, number, number, number] {
  const cached = boundsCache.get(feature);
  if (cached) return cached;
  const points =
    feature.geometry.type === 'Polygon'
      ? feature.geometry.coordinates.flat()
      : feature.geometry.coordinates.flat(2);
  const bounds = points.reduce<[number, number, number, number]>(
    (b, p) => [
      Math.min(b[0], p[0]),
      Math.min(b[1], p[1]),
      Math.max(b[2], p[0]),
      Math.max(b[3], p[1]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
  boundsCache.set(feature, bounds);
  return bounds;
}
function inRing(x: number, y: number, ring: Position[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function containsPoint(feature: Province, longitude: number, latitude: number) {
  const polygons =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
  return polygons.some(
    (rings) =>
      inRing(longitude, latitude, rings[0]) &&
      !rings.slice(1).some((r) => inRing(longitude, latitude, r)),
  );
}
