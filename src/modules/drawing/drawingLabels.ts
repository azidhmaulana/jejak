import { Marker, MercatorCoordinate, type Map as LibreMap } from 'maplibre-gl';
import type { Drawing } from './mapToolsStore';
import { objectName } from './drawingObjects';

// Work in map coordinates so labels sit visually in the middle at every zoom.
function labelAnchor(feature: Drawing): [number, number] | null {
  const geometry = feature.geometry;
  if (geometry.type === 'Point') return geometry.coordinates.slice(0, 2) as [number, number];
  if (geometry.type !== 'Polygon' && geometry.type !== 'LineString') return null;
  const coordinates = geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates;
  if (!coordinates.length) return null;
  const points = coordinates.map((coordinate) =>
    MercatorCoordinate.fromLngLat({ lng: coordinate[0], lat: coordinate[1] }),
  );
  // Keep objects crossing the antimeridian in one continuous world copy.
  for (let i = 1; i < points.length; i++) points[i].x += Math.round(points[i - 1].x - points[i].x);
  let x = points[0].x,
    y = points[0].y;
  if (geometry.type === 'LineString') {
    const lengths = points
      .slice(1)
      .map((point, i) => Math.hypot(point.x - points[i].x, point.y - points[i].y));
    let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
    for (let i = 0; i < lengths.length; i++) {
      if (remaining <= lengths[i]) {
        const ratio = lengths[i] ? remaining / lengths[i] : 0;
        x = points[i].x + (points[i + 1].x - points[i].x) * ratio;
        y = points[i].y + (points[i + 1].y - points[i].y) * ratio;
        break;
      }
      remaining -= lengths[i];
    }
  } else {
    y =
      (Math.min(...points.map((point) => point.y)) + Math.max(...points.map((point) => point.y))) /
      2;
    // Center within the widest interior span, including concave drawing shapes.
    const crossings: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      if (a.y > y !== b.y > y) crossings.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
    crossings.sort((a, b) => a - b);
    let widest = -1;
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      if (crossings[i + 1] - crossings[i] > widest) {
        widest = crossings[i + 1] - crossings[i];
        x = (crossings[i] + crossings[i + 1]) / 2;
      }
    }
  }
  const position = new MercatorCoordinate(x, y).toLngLat();
  return [position.lng, position.lat];
}

export function createDrawingLabels(map: LibreMap) {
  const markers = new Map<string | number, Marker>();
  return {
    update(features: Drawing[]) {
      const visible = new Set<string | number>();
      for (const feature of features) {
        if (feature.id == null || feature.properties.currentlyDrawing) continue;
        const anchor = labelAnchor(feature);
        if (!anchor) continue;
        visible.add(feature.id);
        let marker = markers.get(feature.id);
        if (!marker) {
          const element = document.createElement('div');
          element.className = 'map-drawing-name';
          element.setAttribute('aria-hidden', 'true');
          marker = new Marker({ element, anchor: 'center' }).setLngLat(anchor).addTo(map);
          markers.set(feature.id, marker);
        }
        marker.getElement().textContent = objectName(feature);
        marker.getElement().style.color = String(feature.properties.drawColor);
        marker.setOffset(feature.geometry.type === 'Point' ? [0, -16] : [0, 0]).setLngLat(anchor);
      }
      for (const [id, marker] of markers)
        if (!visible.has(id)) {
          marker.remove();
          markers.delete(id);
        }
    },
    destroy() {
      markers.forEach((marker) => marker.remove());
      markers.clear();
    },
  };
}
