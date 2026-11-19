import type { ScalarGrid } from './scalarWeather';
import type { FeatureCollection, LineString, Point } from 'geojson';
export function pressureContours(grid: ScalarGrid): FeatureCollection<LineString> {
  const features: FeatureCollection<LineString>['features'] = [];
  for (let level = 900; level <= 1080; level += 4) {
    for (let y = 5; y < 175; y++)
      for (let x = 0; x < 359; x++) {
        const v = [
          grid.values[y * 360 + x],
          grid.values[y * 360 + x + 1],
          grid.values[(y + 1) * 360 + x + 1],
          grid.values[(y + 1) * 360 + x],
        ];
        if (v.some((n) => n === null)) continue;
        const points = [
            [x, 90 - y],
            [x + 1, 90 - y],
            [x + 1, 89 - y],
            [x, 89 - y],
          ],
          cross: number[][] = [];
        for (let edge = 0; edge < 4; edge++) {
          const j = (edge + 1) % 4,
            a = v[edge]!,
            b = v[j]!;
          if (a < level === b < level) continue;
          const t = (level - a) / (b - a);
          cross.push(points[edge].map((n, k) => n + (points[j][k] - n) * t));
        }
        if (
          cross.length === 4 &&
          v[0]! < level !== v.reduce<number>((sum, n) => sum + n!, 0) / 4 < level
        )
          [cross[1], cross[3]] = [cross[3], cross[1]];
        for (let i = 0; i + 1 < cross.length; i += 2) {
          const pair = [cross[i], cross[i + 1]].map((p) => [p[0] > 180 ? p[0] - 360 : p[0], p[1]]);
          if (Math.abs(pair[0][0] - pair[1][0]) > 180) continue;
          features.push({
            type: 'Feature',
            properties: { pressure: level },
            geometry: { type: 'LineString', coordinates: pair },
          });
        }
      }
  }
  const joined: FeatureCollection<LineString>['features'] = [];
  for (let level = 900; level <= 1080; level += 4) {
    const segments = features.filter((f) => f.properties?.pressure === level);
    const keys = new Map<string, number[]>(),
      used = new Set<number>();
    const key = (p: number[]) => p.map((n) => n.toFixed(6)).join(',');
    segments.forEach((f, i) =>
      f.geometry.coordinates.forEach((p) => {
        const k = key(p);
        keys.set(k, [...(keys.get(k) || []), i]);
      }),
    );
    segments.forEach((f, i) => {
      if (used.has(i)) return;
      used.add(i);
      const line = [...f.geometry.coordinates];
      for (const front of [false, true])
        while (true) {
          const end = front ? line[0] : line[line.length - 1],
            k = key(end),
            next = keys.get(k)?.find((n) => !used.has(n));
          if (next === undefined) break;
          used.add(next);
          const pair = segments[next].geometry.coordinates,
            p = key(pair[0]) === k ? pair[1] : pair[0];
          if (front) line.unshift(p);
          else line.push(p);
        }
      joined.push({
        type: 'Feature',
        properties: { pressure: level },
        geometry: { type: 'LineString', coordinates: line },
      });
    });
  }
  return { type: 'FeatureCollection', features: joined };
}

export function pressureCenters(grid: ScalarGrid): FeatureCollection<Point> {
  const candidates: { x: number; y: number; value: number; label: string; strength: number }[] = [];
  for (let y = 10; y < 170; y++)
    for (let x = 0; x < 360; x++) {
      const value = grid.values[y * 360 + x];
      if (value === null) continue;
      const neighbors: number[] = [];
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++)
          if (dx || dy) {
            const v = grid.values[(y + dy) * 360 + ((x + dx + 360) % 360)];
            if (v !== null) neighbors.push(v);
          }
      const high = neighbors.every((v) => v < value),
        low = neighbors.every((v) => v > value);
      if (!high && !low) continue;
      const mean = neighbors.reduce((a, b) => a + b, 0) / neighbors.length,
        strength = Math.abs(value - mean);
      if (strength >= 0.5) candidates.push({ x, y, value, label: high ? 'H' : 'L', strength });
    }
  const selected: typeof candidates = [];
  for (const c of candidates.sort((a, b) => b.strength - a.strength)) {
    if (
      selected.some(
        (p) => Math.hypot(Math.min(Math.abs(p.x - c.x), 360 - Math.abs(p.x - c.x)), p.y - c.y) < 8,
      )
    )
      continue;
    selected.push(c);
    if (selected.length >= 100) break;
  }
  return {
    type: 'FeatureCollection',
    features: selected.map((c) => ({
      type: 'Feature',
      properties: { label: c.label, pressure: c.value },
      geometry: { type: 'Point', coordinates: [c.x > 180 ? c.x - 360 : c.x, 90 - c.y] },
    })),
  };
}
