import type { Hotspot } from '../hotspots/hotspotStore';
import { containsPoint, provinceBounds, type Province } from '../regions/geometry';

export function hotspotStatistics(
  items: Hotspot[],
  days: string[],
  provinces: Province[],
  province = '',
  confidence = 'all',
) {
  const bounds = provinces.map((p) => ({ p, b: provinceBounds(p) }));
  const unique = new Map<string, Hotspot>();
  for (const item of items) {
    const key = `${item.satellite}:${Math.floor(item.time / 60000)}:${item.lat.toFixed(4)}:${item.lng.toFixed(4)}`;
    unique.set(key, item);
  }
  const trend = new Map(days.map((day) => [day, 0]));
  const regions = new Map<string, number>();
  let total = 0,
    high = 0,
    unknown = 0;
  for (const item of unique.values()) {
    const day = new Date(item.time).toISOString().slice(0, 10);
    if (!trend.has(day) || (confidence !== 'all' && item.confidence !== confidence)) continue;
    const region = bounds.find(
      ({ p, b }) =>
        item.lng >= b[0] &&
        item.lng <= b[2] &&
        item.lat >= b[1] &&
        item.lat <= b[3] &&
        containsPoint(p, item.lng, item.lat),
    )?.p.properties.PROVINSI;
    if (province && region !== province) continue;
    total++;
    if (item.confidence === 'high') high++;
    trend.set(day, trend.get(day)! + 1);
    if (region) regions.set(region, (regions.get(region) || 0) + 1);
    else unknown++;
  }
  return {
    total,
    high,
    unknown,
    regionCount: regions.size,
    trend: [...trend].map(([day, views]) => ({ day, views })),
    regions: [...regions]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 5),
  };
}
