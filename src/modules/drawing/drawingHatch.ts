import type { Map as LibreMap } from 'maplibre-gl';
import type { Drawing } from './mapToolsStore';

// Clip evenly spaced screen-space lines against polygon rings (even/odd fill rule).
// This keeps hatch spacing stable while zooming, without adding sprite images that
// cause MapLibre 4 to reload unrelated raster sources when a color changes.
export function hatchLines(map: LibreMap, feature: Drawing): number[][][] {
  if (feature.geometry.type !== 'Polygon') return [];
  const rings = feature.geometry.coordinates.map((ring) =>
    ring.map((point) => map.project([point[0], point[1]])),
  );
  const width = map.getCanvas().clientWidth,
    height = map.getCanvas().clientHeight;
  const lines: number[][][] = [];
  for (const sign of feature.properties.drawFillStyle === 'crosshatch' ? [-1, 1] : [1]) {
    const corners = [
      [-16, -16],
      [width + 16, -16],
      [width + 16, height + 16],
      [-16, height + 16],
    ];
    const bounds = corners.map(([x, y]) => y - sign * x);
    for (
      let offset = Math.floor(Math.min(...bounds) / 8) * 8;
      offset <= Math.max(...bounds);
      offset += 8
    ) {
      const intersections: number[] = [];
      for (const ring of rings) {
        for (let i = 1; i < ring.length; i++) {
          const a = ring[i - 1],
            b = ring[i];
          const da = a.y - sign * a.x - offset,
            db = b.y - sign * b.x - offset;
          // Half-open comparison counts a shared vertex exactly once.
          if ((da <= 0 && db > 0) || (db <= 0 && da > 0))
            intersections.push(a.x + ((b.x - a.x) * da) / (da - db));
        }
      }
      intersections.sort((a, b) => a - b);
      for (let i = 1; i < intersections.length; i += 2) {
        const yBounds = [(-16 - offset) / sign, (height + 16 - offset) / sign];
        const left = Math.max(-16, Math.min(...yBounds), intersections[i - 1]);
        const right = Math.min(width + 16, Math.max(...yBounds), intersections[i]);
        if (right - left < 0.1) continue;
        lines.push(
          [
            [left, sign * left + offset],
            [right, sign * right + offset],
          ].map((point) => {
            const coordinate = map.unproject([point[0], point[1]]);
            return [coordinate.lng, coordinate.lat];
          }),
        );
      }
    }
  }
  return lines;
}
