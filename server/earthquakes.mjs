import { Router } from 'express';
import { createClient } from 'redis';
import { createHash } from 'node:crypto';

const DAY = 86400000;
const prefix = 'jejak:earthquakes:v1:';
const feeds = ['gempaterkini', 'gempadirasakan', 'autogempa'];
const text = value => String(value || '').slice(0, 1000);
const inside = (lat, lng) => lat >= -12 && lat <= 8 && lng >= 92 && lng <= 142;
export function normalizeBmkg(value) {
  const [lat, lng] = String(value.Coordinates || '').split(',').map(Number);
  const time = Date.parse(value.DateTime), magnitude = Number(value.Magnitude);
  const depth = Number.parseFloat(value.Kedalaman);
  if (![lat, lng, time, magnitude, depth].every(Number.isFinite) || !inside(lat, lng)) return null;
  return { id: `bmkg-${time}`, time, lat, lng, magnitude, depth, place: text(value.Wilayah), source: 'BMKG',
    felt: text(value.Dirasakan), potential: text(value.Potensi),
    url: 'https://www.bmkg.go.id/gempabumi',
    shakemap: /^[\w.-]+\.jpg$/.test(value.Shakemap || '') ? `https://static.bmkg.go.id/${value.Shakemap}` : '' };
}
export function normalizeUsgs(value) {
  const p = value.properties || {}, [lng, lat, depth] = value.geometry?.coordinates || [];
  if (!value.id || ![lat, lng, depth, p.time, p.mag].every(Number.isFinite) || !inside(lat, lng)) return null;
  return { id: `usgs-${value.id}`, time: p.time, lat, lng, depth, magnitude: p.mag, place: text(p.place), source: 'USGS',
    felt: '', potential: '', shakemap: '', url: `https://earthquake.usgs.gov/earthquakes/eventpage/${encodeURIComponent(value.id)}` };
}
export function mergeEvents(events) {
  const result = new Map();
  for (const event of events.filter(Boolean)) {
    const previous = result.get(event.id);
    result.set(event.id, previous ? { ...previous, ...event, felt: event.felt || previous.felt, potential: event.potential || previous.potential, shakemap: event.shakemap || previous.shakemap } : event);
  }
  // Keep separate agency solutions identifiable rather than guessing that nearby events are identical.
  return [...result.values()].sort((a, b) => b.time - a.time);
}
export function parseRange(query, now = Date.now()) {
  if (!query.start && !query.end) return null;
  const valid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0, 10) === value;
  try {
    if (!valid(query.start) || !valid(query.end)) throw Error();
    const start = Date.parse(`${query.start}T00:00:00+07:00`), end = Date.parse(`${query.end}T23:59:59.999+07:00`);
    const anniversary = new Date(start); anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
    if (end >= anniversary.getTime()) throw Error();
    if ((query.page !== undefined && typeof query.page !== 'string') || (query.minMagnitude !== undefined && typeof query.minMagnitude !== 'string')) throw Error();
    const page = Number(query.page || 0);
    const minMagnitude = Number(query.minMagnitude || 0);
    if (!Number.isFinite(minMagnitude) || minMagnitude < 0 || minMagnitude > 9) throw Error();
    if (start < Date.parse('1900-01-01T00:00:00+07:00') || start > end || start > now || !Number.isInteger(page) || page < 0 || page > 100) throw Error();
    return { start, end: Math.min(end, now), page, minMagnitude };
  } catch { throw Object.assign(Error('Invalid date range or page.'), { status: 400 }); }
}
async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (!response.ok) throw Error('Earthquake source unavailable');
  const reader = response.body.getReader();
  let size = 0; const chunks = [];
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 12 * 1024 * 1024) { await reader.cancel(); throw Error('Source response too large'); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function createEarthquakes({ url = process.env.JEJAK_REDIS_URL, fetchJson = getJson } = {}) {
  const router = Router();
  const redis = url ? createClient({ url, socket: { connectTimeout: 4000, reconnectStrategy: retries => Math.min(1000 * (retries + 1), 10000) }, disableOfflineQueue: true }) : null;
  redis?.on('error', () => {});
  let working = null, stopped = false;
  const requireRedis = () => { if (!redis?.isReady) throw Object.assign(Error('Earthquake storage unavailable.'), { status: 503 }); };
  const refresh = () => {
    if (working) return working;
    working = (async () => {
      requireRedis();
      if (!await redis.set(prefix + 'poll-lock', '1', { NX: true, EX: 55 })) return;
      const status = JSON.parse(await redis.get(prefix + 'status') || '{}');
      const results = await Promise.allSettled(feeds.map(async feed => {
        const data = await fetchJson(`https://data.bmkg.go.id/DataMKG/TEWS/${feed}.json`);
        if (!data.Infogempa?.gempa) throw Error('Invalid BMKG response');
        return [data.Infogempa.gempa].flat().map(normalizeBmkg).filter(Boolean);
      }));
      const events = mergeEvents(results.flatMap(r => r.status === 'fulfilled' ? r.value : []));
      status.bmkgStale = results.some(r => r.status === 'rejected');
      if (!status.bmkgStale) status.bmkgUpdatedAt = new Date().toISOString();
      if (!status.usgsUpdatedAt || Date.now() - Date.parse(status.usgsUpdatedAt) > 300000) {
        try {
          const data = await fetchJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson');
          if (!Array.isArray(data.features)) throw Error('Invalid USGS response');
          events.push(...data.features.map(normalizeUsgs).filter(Boolean));
          status.usgsUpdatedAt = new Date().toISOString(); status.usgsStale = false;
        } catch { status.usgsStale = true; }
      }
      const tx = redis.multi();
      for (const event of events) {
        tx.set(prefix + 'event:' + event.id, JSON.stringify(event), { EX: 180 * 86400 });
        tx.zAdd(prefix + 'index', { score: event.time, value: event.id });
      }
      tx.zRemRangeByScore(prefix + 'index', '-inf', Date.now() - 180 * DAY);
      tx.set(prefix + 'status', JSON.stringify(status));
      await tx.exec();
    })().finally(() => { working = null; });
    return working;
  };
  const archived = async (start, end) => {
    const ids = await redis.zRangeByScore(prefix + 'index', start, end);
    return ids.length ? (await redis.mGet(ids.map(id => prefix + 'event:' + id))).filter(Boolean).map(JSON.parse) : [];
  };
  let searches = 0;
  router.get('/', async (req, res, next) => {
    try {
      const range = parseRange(req.query);
      requireRedis();
      const status = JSON.parse(await redis.get(prefix + 'status') || '{}');
      status.bmkgStale = Boolean(status.bmkgStale || !status.bmkgUpdatedAt || Date.now() - Date.parse(status.bmkgUpdatedAt) > 180000);
      status.usgsStale = Boolean(status.usgsStale || !status.usgsUpdatedAt || Date.now() - Date.parse(status.usgsUpdatedAt) > 600000);
      const saved = await archived(range?.start || Date.now() - 2 * DAY, range?.end || Date.now());
      const latestIds = await redis.zRange(prefix + 'index', -1, -1);
      const latest = latestIds.length ? JSON.parse(await redis.get(prefix + 'event:' + latestIds[0]) || 'null') : null;
      let items = saved, hasMore = false, historyUnavailable = false, total = null, scanned = 0;
      if (range) {
        const key = prefix + 'query:' + createHash('sha256').update(JSON.stringify(['magnitude-count-v3', req.query.start, req.query.end, range.page, range.minMagnitude])).digest('hex');
        let cached = await redis.get(key);
        if (!cached) {
          if (searches >= 2) return res.status(429).json({ error: 'Earthquake searches busy. Try again shortly.' });
          searches++;
          try {
            const params = new URLSearchParams({ format: 'geojson', minmagnitude: String(range.minMagnitude), starttime: new Date(range.start).toISOString(), endtime: new Date(range.end).toISOString(), minlatitude: '-12', maxlatitude: '8', minlongitude: '92', maxlongitude: '142', orderby: 'magnitude', limit: '1000', offset: String(range.page * 1000 + 1), eventtype: 'earthquake' });
            const countParams = new URLSearchParams(params);
            for (const key of ['limit', 'offset', 'orderby']) countParams.delete(key);
            const [data, count] = await Promise.all([fetchJson(`https://earthquake.usgs.gov/fdsnws/event/1/query?${params}`), fetchJson(`https://earthquake.usgs.gov/fdsnws/event/1/count?${countParams}`)]);
            if (!Array.isArray(data.features)) throw Error('Invalid catalog response');
            cached = JSON.stringify({ total: count.count, scanned: data.features.length, items: data.features.map(normalizeUsgs).filter(Boolean), hasMore: data.features.length === 1000 });
            await redis.set(key, cached, { EX: 600 });
          } catch { historyUnavailable = true; } finally { searches--; }
        }
        if (cached) { const data = JSON.parse(cached); items = [...(range.page === 0 ? saved.filter(q => q.source === 'BMKG') : []), ...data.items]; hasMore = data.hasMore; total = data.total; scanned = data.scanned; }
      }
      const all = mergeEvents(items).filter(q => !range || q.magnitude >= range.minMagnitude);
      if (range) all.sort((a, b) => b.magnitude - a.magnitude || b.time - a.time);
      res.set('Cache-Control', 'no-store').json({ items: all, latest, total, scanned, hasMore, historyUnavailable, status,
        coverage: 'Indonesia and surrounding waters (92–142 E, 12 S–8 N). BMKG public feeds and USGS catalog; not a complete local earthquake catalog. Agency solutions may overlap.' });
    } catch (error) { next(error); }
  });
  const timer = redis ? setInterval(() => { if (!stopped) void refresh().catch(() => {}); }, 60000) : null;
  timer?.unref();
  if (redis) void redis.connect().then(() => { if (!stopped) return refresh(); }).catch(() => {});
  return { router, close: async () => { stopped = true; clearInterval(timer); await working?.catch(() => {}); if (redis?.isOpen) redis.destroy(); } };
}
