export const ARCHIVE_ROOT = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
export const ARCHIVE_LAYER = 'Himawari_AHI_Band13_Clean_Infrared';
export function historyBounds(now = Date.now()) {
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() - 1);
  const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(end.getUTCDate(), last));
  return { min: start.toISOString().slice(0, 10), max: end.toISOString().slice(0, 10) };
}
export function validHistoryDate(date, now = Date.now()) {
  const { min, max } = historyBounds(now);
  return (
    typeof date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date &&
    date >= min &&
    date <= max
  );
}
export function dailyArchiveFrames(xml, now = Date.now()) {
  const layer = xml
    .split('<Layer>')
    .find((part) => part.includes(`<ows:Identifier>${ARCHIVE_LAYER}</ows:Identifier>`));
  if (!layer) throw new Error('Archive layer missing');
  const ranges = [...layer.matchAll(/<Value>([^<]+)<\/Value>/g)]
    .map((match) => {
      const [start, end = start, step = 'PT10M'] = match[1].split('/');
      return { start: Date.parse(start), end: Date.parse(end), step };
    })
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.step === 'PT10M');
  const { min, max } = historyBounds(now);
  const frames = [];
  for (let day = Date.parse(min); day <= Date.parse(max); day += 86400000) {
    const target = day + 5 * 3600000;
    let best;
    for (const r of ranges) {
      const low = Math.max(day, r.start),
        high = Math.min(day + 86400000 - 1, r.end, now);
      if (low > high) continue;
      const first = r.start + Math.ceil((low - r.start) / 600000) * 600000;
      const last = r.start + Math.floor((high - r.start) / 600000) * 600000;
      if (first > last) continue;
      const candidate = Math.max(
        first,
        Math.min(last, r.start + Math.round((target - r.start) / 600000) * 600000),
      );
      if (best === undefined || Math.abs(candidate - target) < Math.abs(best - target))
        best = candidate;
    }
    if (best !== undefined)
      frames.push({
        id: 'h' + new Date(best).toISOString().replace(/\D/g, '').slice(0, 14),
        time: best,
        date: new Date(day).toISOString().slice(0, 10),
      });
  }
  return frames;
}
export function createHistory({ download, fetcher, now }) {
  let frames = [],
    expires = 0,
    retryAt = 0,
    pending;
  async function timeline() {
    if (now() < expires) return frames;
    if (!pending && now() < retryAt) throw new Error('Archive temporarily unavailable');
    if (!pending)
      pending = (async () => {
        retryAt = now() + 30000;
        const result = await download(
          `${ARCHIVE_ROOT}/1.0.0/WMTSCapabilities.xml`,
          10000000,
          fetcher,
        );
        frames = dailyArchiveFrames(result.body.toString(), now());
        expires = now() + 10 * 60000;
        return frames;
      })().finally(() => {
        pending = null;
      });
    return pending;
  }
  return { timeline };
}
