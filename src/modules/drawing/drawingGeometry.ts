import type { Drawing } from './mapToolsStore';
import { distanceMeters, measureDrawing } from './mapMeasurements';

export interface GeometryEdit {
  longitude: number;
  latitude: number;
  size?: number;
  height?: number;
}
const rad = Math.PI / 180;
const wrap = (lng: number) => ((((lng + 540) % 360) + 360) % 360) - 180;
export function drawingPoints(feature: Drawing): number[][] {
  const g = feature.geometry;
  return g.type === 'Point'
    ? [g.coordinates]
    : g.type === 'LineString'
      ? g.coordinates
      : g.type === 'Polygon'
        ? g.coordinates[0].slice(0, -1)
        : [];
}
export function drawingCenter(feature: Drawing): [number, number] {
  const points = drawingPoints(feature);
  if (!points.length) return [0, 0];
  const vector = points.reduce(
    (v, [lng, lat]) => [
      v[0] + Math.cos(lat * rad) * Math.cos(lng * rad),
      v[1] + Math.cos(lat * rad) * Math.sin(lng * rad),
      v[2] + Math.sin(lat * rad),
    ],
    [0, 0, 0],
  );
  return [
    Math.atan2(vector[1], vector[0]) / rad,
    Math.atan2(vector[2], Math.hypot(vector[0], vector[1])) / rad,
  ];
}
export function geometryValues(feature: Drawing): GeometryEdit {
  const [longitude, latitude] = drawingCenter(feature);
  const points = drawingPoints(feature);
  return {
    longitude,
    latitude,
    size: measureDrawing(feature)?.meters,
    height:
      feature.properties.mode === 'rectangle' ? distanceMeters(points[1], points[2]) : undefined,
  };
}
function destination(center: number[], meters: number, bearing: number): number[] {
  const distance = meters / 6371000,
    lat = center[1] * rad,
    lng = center[0] * rad;
  const nextLat = Math.asin(
    Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(bearing),
  );
  return [
    wrap(
      (lng +
        Math.atan2(
          Math.sin(bearing) * Math.sin(distance) * Math.cos(lat),
          Math.cos(distance) - Math.sin(lat) * Math.sin(nextLat),
        )) /
        rad,
    ),
    nextLat / rad,
  ];
}
/** Move/resize the existing shape without discarding holes or metadata. Units are meters. */
export function editDrawingGeometry(feature: Drawing, edit: GeometryEdit): Drawing {
  if (
    !Number.isFinite(edit.longitude) ||
    !Number.isFinite(edit.latitude) ||
    Math.abs(edit.longitude) > 180 ||
    Math.abs(edit.latitude) > 85
  )
    throw Error('Koordinat harus valid; latitude edit dibatasi -85 sampai 85.');
  for (const size of [edit.size, edit.height])
    if (size !== undefined && (!Number.isFinite(size) || size <= 0 || size > 1000000))
      throw Error('Ukuran harus lebih dari 0 sampai 1.000.000 meter.');
  const next = structuredClone(feature),
    g = next.geometry;
  const center = drawingCenter(feature),
    target = [edit.longitude, edit.latitude];
  const transform = (fn: (p: number[]) => number[]) => {
    if (g.type === 'Point') g.coordinates = fn(g.coordinates);
    else if (g.type === 'LineString') g.coordinates = g.coordinates.map(fn);
    else if (g.type === 'Polygon') g.coordinates = g.coordinates.map((ring) => ring.map(fn));
  };
  if (g.type === 'Point') g.coordinates = target;
  else if (feature.properties.mode === 'circle' && g.type === 'Polygon') {
    const radius = edit.size ?? measureDrawing(feature)!.meters;
    const ring = Array.from({ length: 64 }, (_, i) =>
      destination(target, radius, (i * 2 * Math.PI) / 64),
    );
    ring.push([...ring[0]]);
    g.coordinates = [ring];
    next.properties.radiusKilometers = radius / 1000;
  } else {
    transform((p) => [
      wrap(
        target[0] +
          (wrap(p[0] - center[0]) * Math.cos(center[1] * rad)) / Math.cos(target[1] * rad),
      ),
      target[1] + p[1] - center[1],
    ]);
    // Correct the requested geodesic lengths after moving to another latitude.
    for (let i = 0; i < 6 && edit.size !== undefined; i++) {
      const measured = measureDrawing(next)?.meters || 0;
      if (measured < 0.0001) throw Error('Objek tidak mempunyai panjang yang dapat diubah.');
      const sx = edit.size / measured;
      if (
        feature.properties.mode === 'rectangle' &&
        g.type === 'Polygon' &&
        edit.height !== undefined
      ) {
        const ring = g.coordinates[0],
          sy = edit.height / distanceMeters(ring[1], ring[2]);
        const dx = wrap(ring[1][0] - ring[0][0]) * Math.cos(target[1] * rad),
          dy = ring[1][1] - ring[0][1];
        const angle = Math.atan2(dy, dx),
          c = Math.cos(angle),
          s = Math.sin(angle);
        transform((p) => {
          const x = wrap(p[0] - target[0]) * Math.cos(target[1] * rad),
            y = p[1] - target[1];
          const a = (x * c + y * s) * sx,
            b = (-x * s + y * c) * sy;
          return [
            wrap(target[0] + (a * c - b * s) / Math.cos(target[1] * rad)),
            target[1] + a * s + b * c,
          ];
        });
      } else
        transform((p) => [
          wrap(target[0] + wrap(p[0] - target[0]) * sx),
          target[1] + (p[1] - target[1]) * sx,
        ]);
    }
  }
  if (drawingPoints(next).some((p) => !p.every(Number.isFinite) || Math.abs(p[1]) > 85))
    throw Error('Geometri keluar dari batas peta. Kurangi ukuran atau ubah pusatnya.');
  transform((p) => p.map((n) => Number(n.toFixed(9))));
  delete next.properties.selected;
  return next;
}
