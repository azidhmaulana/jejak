import express from 'express';
export const CYCLONE_HISTORY_SOURCE =
  'https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.ACTIVE.list.v04r01.csv';
export function atcfId(id) {
  if (/^(?:al|ep|cp)\d{6}$/.test(id)) return id.toUpperCase();
  if (/^(?:wp|io|sh|ep|cp)\d{4}$/.test(id))
    return (id.slice(0, 4) + '20' + id.slice(4)).toUpperCase();
  return null;
}
export function parseHistory(text, now = Date.now()) {
  const [header, , ...lines] = text.trim().split(/\r?\n/);
  const keys = header.split(',').map((x) => x.trim());
  if (
    !['USA_ATCF_ID', 'ISO_TIME', 'USA_LAT', 'USA_LON', 'USA_WIND', 'USA_PRES'].every((k) =>
      keys.includes(k),
    )
  )
    throw new Error('Invalid history schema');
  const tracks = new Map();
  for (const line of lines) {
    const row = line.split(',');
    if (row.length !== keys.length) continue;
    const get = (k) => row[keys.indexOf(k)]?.trim();
    const numeric = (k) => (get(k) === '' ? NaN : Number(get(k)));
    const id = get('USA_ATCF_ID');
    if (!/^(?:AL|EP|CP|WP|IO|SH)\d{6}$/.test(id)) continue;
    const time = Date.parse(get('ISO_TIME').replace(' ', 'T') + 'Z'),
      lat = numeric('USA_LAT'),
      lng = numeric('USA_LON');
    if (
      !Number.isFinite(time) ||
      time > now ||
      now - time > 45 * 86400000 ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    )
      continue;
    const wind = numeric('USA_WIND'),
      pressure = numeric('USA_PRES');
    if (!tracks.has(id)) tracks.set(id, new Map());
    tracks.get(id).set(time, {
      time,
      lat,
      lng,
      windKnots: Number.isFinite(wind) && wind >= 0 && wind <= 250 ? wind : null,
      pressureHpa:
        Number.isFinite(pressure) && pressure >= 800 && pressure <= 1100 ? pressure : null,
    });
  }
  return new Map(
    [...tracks].map(([id, points]) => [
      id,
      [...points.values()].sort((a, b) => a.time - b.time).slice(-240),
    ]),
  );
}
export function createCycloneHistory({ fetcher = fetch, now = Date.now, observations } = {}) {
  const router = express.Router();
  let cache = null,
    until = 0,
    pending = null;
  const load = () => {
    if (cache && now() < until) return Promise.resolve(cache);
    if (pending) return pending;
    pending = (async () => {
      const r = await fetcher(CYCLONE_HISTORY_SOURCE, {
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      });
      if (!r.ok) throw new Error('History unavailable');
      const reader = r.body.getReader();
      let size = 0;
      const parts = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 2000000) throw new Error('History too large');
          parts.push(Buffer.from(value));
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      cache = parseHistory(Buffer.concat(parts).toString(), now());
      until = now() + 30 * 60000;
      return cache;
    })().finally(() => {
      pending = null;
    });
    return pending;
  };
  router.get('/:id/history', async (req, res) => {
    if (/^invest-9\d[spwabc]-\d{4}$/.test(req.params.id)) {
      try {
        const result = await observations?.history(req.params.id);
        return res.json({
          id: req.params.id,
          points: result?.points || [],
          source: result?.source || '',
          provisional: true,
        });
      } catch {
        return res.status(503).json({ error: 'Recorded history unavailable' });
      }
    }
    const id = atcfId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Unsupported cyclone identifier' });
    try {
      const tracks = await load();
      res.set('Cache-Control', 'public, max-age=300').json({
        id: req.params.id,
        points: tracks.get(id) || [],
        source: CYCLONE_HISTORY_SOURCE,
        provisional: true,
      });
    } catch {
      res.status(503).json({ error: 'Cyclone history unavailable' });
    }
  });
  return router;
}
