import { blendSatellite } from './satellite-composite.mjs';
import express from 'express';
import {
  createHistory,
  validHistoryDate,
  ARCHIVE_ROOT,
  ARCHIVE_LAYER,
} from './himawari-history.mjs';
import { concurrencyLimit, rateLimit } from './request-protection.mjs';

const ROOT = 'https://www.jma.go.jp/bosai/himawari/data/satimg';
export const HIMAWARI_SOURCE = 'https://www.jma.go.jp/bosai/map.html#contents=himawari';
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{14}$/.test(value)) return NaN;
  const date = Date.parse(
    value.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1-$2-$3T$4:$5:$6Z'),
  );
  return Number.isFinite(date) &&
    new Date(date).toISOString().replace(/\D/g, '').slice(0, 14) === value
    ? date
    : NaN;
}
export function parseHimawariFrames(data, now = Date.now()) {
  if (!Array.isArray(data)) throw new Error('Invalid satellite timeline');
  const frames = new Map();
  for (const row of data) {
    const time = timestamp(row?.validtime),
      base = timestamp(row?.basetime);
    if (!Number.isFinite(time) || base !== time || time > now + 600000 || time < now - 48 * 3600000)
      continue;
    frames.set(row.validtime, { id: row.validtime, time, basetime: row.basetime });
  }
  const sorted = [...frames.values()].sort((a, b) => a.time - b.time);
  const latest = sorted.at(-1)?.time;
  const recent = sorted.filter((frame) => frame.time >= latest - 12 * 3600000).slice(-73);
  if (!recent.length) throw new Error('No recent satellite frames');
  return recent;
}
async function download(url, maxBytes, fetcher) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(12000), redirect: 'error' });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('Satellite source unavailable');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('Satellite response too large');
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return { body: Buffer.concat(chunks), type: response.headers.get('content-type') || '' };
}
export function createHimawari({ fetcher = fetch, now = Date.now } = {}) {
  const router = express.Router();
  const history = createHistory({ download, fetcher, now });
  let frames = [],
    fetchedAt = 0,
    retryAt = 0,
    manifestRequest = null;
  const cache = new Map(),
    pending = new Map();
  let bytes = 0,
    activeTiles = 0;
  const waiting = [];
  async function withTileSlot(task) {
    if (activeTiles >= 8) await new Promise((resolve) => waiting.push(resolve));
    else activeTiles++;
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else activeTiles--;
    }
  }
  const put = (key, item) => {
    if (cache.has(key)) {
      bytes -= cache.get(key).body?.length || 0;
      cache.delete(key);
    }
    cache.set(key, item);
    bytes += item.body?.length || 0;
    while (cache.size > 1200 || bytes > 32 * 1024 * 1024) {
      const oldest = cache.keys().next().value;
      bytes -= cache.get(oldest).body?.length || 0;
      cache.delete(oldest);
    }
  };
  async function timeline() {
    if (now() >= retryAt) {
      if (!manifestRequest)
        manifestRequest = (async () => {
          retryAt = now() + 30000;
          try {
            const response = await download(`${ROOT}/targetTimes_fd.json`, 256000, fetcher);
            frames = parseHimawariFrames(JSON.parse(response.body.toString()), now());
            fetchedAt = now();
            retryAt = now() + 60000;
          } finally {
            manifestRequest = null;
          }
        })();
      try {
        await manifestRequest;
      } catch {
        /* Retain the last usable timeline during a short outage. */
      }
    } else if (manifestRequest) {
      await manifestRequest.catch(() => {});
    }
    if (!frames.length || now() - fetchedAt > 12 * 3600000)
      throw new Error('Satellite timeline unavailable');
    return frames;
  }
  router.use(rateLimit({ limit: 1800 }), concurrencyLimit(48));
  router.get('/history', async (req, res) => {
    if (!validHistoryDate(req.query.date, now()))
      return res.status(400).json({ error: 'Invalid archive date.' });
    try {
      const frames = await history.timeline();
      const frame = frames.find((item) => item.date === req.query.date);
      if (!frame) return res.status(404).json({ error: 'No imagery for this date.' });
      res
        .set('Cache-Control', 'public, max-age=300')
        .json({ frames: [frame], stale: false, source: ARCHIVE_ROOT });
    } catch {
      res.status(503).json({ error: 'Archive unavailable.' });
    }
  });
  router.get('/frames', async (_req, res) => {
    try {
      const items = await timeline();
      res.set('Cache-Control', 'public, max-age=30').json({
        frames: items.map(({ id, time }) => ({ id, time })),
        source: HIMAWARI_SOURCE,
        fetchedAt,
        stale: now() - fetchedAt > 120000 || now() - items.at(-1).time > 40 * 60000,
        intervalMinutes: 10,
        product: 'Himawari satellite (Band 03 / Band 13)',
      });
    } catch {
      res
        .set('Cache-Control', 'no-store')
        .status(503)
        .json({ error: 'Satellite timeline unavailable. Try again shortly.' });
    }
  });
  router.get('/tiles/:frame/:z/:x/:tile', async (req, res) => {
    const { frame, z, x, tile } = req.params;
    const archive = frame.startsWith('h');
    const product = req.query.product ?? 'ir';
    if (!['ir', 'visible', 'auto'].includes(product) || (archive && product !== 'ir'))
      return res.status(400).json({ error: 'Invalid satellite product.' });
    const match = /^(\d{1,2})\.jpg$/.exec(tile);
    if (
      !/^h?\d{14}$/.test(frame) ||
      !/^[3-5]$/.test(z) ||
      !/^\d{1,2}$/.test(x) ||
      !match ||
      +x >= 2 ** +z ||
      +match[1] >= 2 ** +z
    )
      return res.status(400).json({ error: 'Invalid satellite tile.' });
    try {
      const items = archive ? await history.timeline() : await timeline();
      if (!items.some((item) => item.id === frame))
        return res.status(404).json({ error: 'Frame is no longer available.' });
      const key = `${product}/${frame}/${z}/${x}/${tile}`;
      let item = cache.get(key);
      if (!item || item.until < now()) {
        let request = pending.get(key);
        if (!request) {
          if (pending.size >= 48) return res.set('Retry-After', '2').status(503).end();
          request = (async () => {
            try {
              let result = await withTileSlot(() =>
                download(
                  archive
                    ? `${ARCHIVE_ROOT}/${ARCHIVE_LAYER}/default/${new Date(items.find((item) => item.id === frame).time).toISOString().replace('.000Z', 'Z')}/GoogleMapsCompatible_Level6/${z}/${match[1]}/${x}.png`
                    : `${ROOT}/${frame}/fd/${frame}/${product === 'visible' ? 'B03/ALBD' : 'B13/TBB'}/${z}/${x}/${tile}`,
                  512000,
                  fetcher,
                ),
              );
              if (
                archive
                  ? !result.type.startsWith('image/png') ||
                    result.body.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
                  : !result.type.startsWith('image/jpeg') ||
                    result.body[0] !== 0xff ||
                    result.body[1] !== 0xd8
              )
                throw new Error('Invalid satellite image');
              if (product === 'auto') {
                const visible = await withTileSlot(() =>
                  download(
                    `${ROOT}/${frame}/fd/${frame}/B03/ALBD/${z}/${x}/${tile}`,
                    512000,
                    fetcher,
                  ),
                );
                if (
                  !visible.type.startsWith('image/jpeg') ||
                  visible.body[0] !== 255 ||
                  visible.body[1] !== 216
                )
                  throw new Error('Invalid visible tile');
                result = {
                  ...result,
                  body: await withTileSlot(() =>
                    blendSatellite(visible.body, result.body, timestamp(frame), +z, +x, +match[1]),
                  ),
                };
              }
              const value = { body: result.body, until: now() + 30 * 60000 };
              put(key, value);
              return value;
            } catch {
              const value = { until: now() + 15000 };
              put(key, value);
              return value;
            } finally {
              pending.delete(key);
            }
          })();
          pending.set(key, request);
        }
        item = await request;
      }
      if (!item.body) return res.set('Cache-Control', 'no-store').status(502).end();
      res
        .set('Cache-Control', 'public, max-age=1800')
        .type(archive ? 'image/png' : 'image/jpeg')
        .send(item.body);
    } catch {
      res.set('Cache-Control', 'no-store').status(503).end();
    }
  });
  return { router };
}
