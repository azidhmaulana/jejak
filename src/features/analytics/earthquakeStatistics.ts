import type { Earthquake } from '../earthquakes/earthquakeStore';

export function isIndonesianEarthquake(quake: Earthquake) {
  // Historical event titles sometimes replace the usual "..., Indonesia" place label.
  const historicalIndonesia = new Set(['usgs-official20041226005853450_30']);
  return /\bIndonesia\b/i.test(quake.place) || historicalIndonesia.has(quake.id);
}

export function earthquakeStatistics(events: Earthquake[]) {
  const unique = [...new Map(events.filter(q => q.source === 'USGS' && isIndonesianEarthquake(q)).map(q => [q.id, q])).values()];
  const groups = [0, 0, 0, 0, 0];
  const regions = new Map<string, number>();
  let largest: Earthquake | null = null;
  for (const quake of unique) {
    groups[quake.magnitude < 5 ? 0 : Math.min(4, Math.floor(quake.magnitude) - 4)]++;
    const name = quake.place.replace(/^\d+(?:\.\d+)?\s+km\s+[A-Z]+\s+of\s+/i, '').trim() || 'Unknown';
    regions.set(name, (regions.get(name) || 0) + 1);
    if (!largest || quake.magnitude > largest.magnitude) largest = quake;
  }
  const top = [...unique].sort((a, b) => b.magnitude - a.magnitude || b.time - a.time).slice(0, 5);
  return { total: unique.length, groups, largest, top, regions: [...regions].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count) };
}
