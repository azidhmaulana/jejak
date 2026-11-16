export const WIND_SCALE = [
  { mph: 0, color: '#21166b' },
  { mph: 4, color: '#24368d' },
  { mph: 9, color: '#24678e' },
  { mph: 15, color: '#248c91' },
  { mph: 22, color: '#41a778' },
  { mph: 28, color: '#74bd48' },
  { mph: 37, color: '#c9d648' },
  { mph: 46, color: '#edb43e' },
  { mph: 56, color: '#e67a35' },
  { mph: 74, color: '#d8413f' },
  { mph: 93, color: '#a12665' },
  { mph: 111, color: '#780a70' },
] as const;
export function windColor(metresPerSecond: number) {
  const mph = Math.max(0, metresPerSecond) * 2.2369362921;
  for (let i = WIND_SCALE.length - 1; i >= 0; i--) {
    if (mph >= WIND_SCALE[i].mph) return WIND_SCALE[i].color;
  }
  return WIND_SCALE[0].color;
}

export function windRgb(metresPerSecond: number): [number, number, number] {
  const mph = Math.max(0, metresPerSecond) * 2.2369362921;
  const upper = WIND_SCALE.findIndex((stop) => stop.mph > mph);
  const low = WIND_SCALE[upper < 0 ? WIND_SCALE.length - 1 : Math.max(0, upper - 1)];
  const high = WIND_SCALE[upper < 0 ? WIND_SCALE.length - 1 : upper];
  const fraction = high.mph === low.mph ? 0 : (mph - low.mph) / (high.mph - low.mph);
  return [1, 3, 5].map((offset) =>
    Math.round(
      parseInt(low.color.slice(offset, offset + 2), 16) * (1 - fraction) +
        parseInt(high.color.slice(offset, offset + 2), 16) * fraction,
    ),
  ) as [number, number, number];
}
