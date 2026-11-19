export function parseJtwcForecast(text, analysisTime) {
  const result = [];
  const blocks = text.split(/(?=\b\d{1,3} HRS, VALID AT:)/).slice(1);
  for (const block of blocks) {
    const m = block.match(
      /^(\d{1,3}) HRS, VALID AT:\s*(\d{2})(\d{2})(\d{2})Z\s*---\s*(\d+(?:\.\d+)?)([NS])\s+(\d+(?:\.\d+)?)([EW])/,
    );
    if (!m) continue;
    const hours = +m[1],
      time = analysisTime + hours * 3600000,
      date = new Date(time);
    const lat = +m[5] * (m[6] === 'S' ? -1 : 1),
      lng = +m[7] * (m[8] === 'W' ? -1 : 1);
    if (
      hours <= 0 ||
      hours > 168 ||
      date.getUTCDate() !== +m[2] ||
      date.getUTCHours() !== +m[3] ||
      date.getUTCMinutes() !== +m[4] ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    )
      continue;
    const wind = block.match(/MAX SUSTAINED WINDS\s*-\s*(\d+) KT/);
    result.push({ time, lat, lng, windKnots: wind && +wind[1] <= 250 ? +wind[1] : null });
  }
  return result
    .filter((p, i) => result.findIndex((x) => x.time === p.time) === i)
    .sort((a, b) => a.time - b.time);
}
