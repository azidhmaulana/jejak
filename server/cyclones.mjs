import express from 'express';
import { rateLimit, concurrencyLimit } from './request-protection.mjs';
const ROOT = 'https://www.metoc.navy.mil/jtwc';
export function parseCycloneFeed(text, now = Date.now()) {
  if (!text.includes('<rss') || !text.includes('JTWC')) throw new Error('Invalid JTWC feed');
  const time = Date.parse(text.match(/<lastBuildDate>([^<]+)</)?.[1] || '');
  if (!Number.isFinite(time) || time > now + 3600000 || now - time > 36 * 3600000)
    throw new Error('Stale JTWC feed');
  const products = [
    ...new Set(
      [...text.matchAll(/\/products\/((?:wp|io|sh|ep|cp)\d{4})web\.txt/g)].map((m) => m[1]),
    ),
  ]
    .filter((id) => Number(id.slice(2, 4)) < 90)
    .slice(0, 20);
  return { time, products };
}
export function parseCycloneWarning(text, id, feedTime, now = Date.now()) {
  const name = text.match(
    /(?:TROPICAL CYCLONE|TYPHOON|TROPICAL STORM|TROPICAL DEPRESSION)\s+(\d{2}[A-Z])\s+\(([^)]+)\)\s+WARNING/i,
  );
  const position = text.match(
    /WARNING POSITION:\s*(\d{2})(\d{2})(\d{2})Z\s*---\s*NEAR\s+(\d+(?:\.\d+)?)([NS])\s+(\d+(?:\.\d+)?)([EW])/,
  );
  if (!name || !position) throw new Error('Unsupported cyclone bulletin');
  const reference = new Date(feedTime);
  const candidates = [-1, 0, 1]
    .map((offset) =>
      Date.UTC(
        reference.getUTCFullYear(),
        reference.getUTCMonth() + offset,
        +position[1],
        +position[2],
        +position[3],
      ),
    )
    .filter((t) => new Date(t).getUTCDate() === +position[1]);
  const time = candidates.sort((a, b) => Math.abs(a - feedTime) - Math.abs(b - feedTime))[0];
  const lat = +position[4] * (position[5] === 'S' ? -1 : 1),
    lng = +position[6] * (position[7] === 'W' ? -1 : 1);
  if (
    !Number.isFinite(time) ||
    +position[2] > 23 ||
    +position[3] > 59 ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  )
    throw new Error('Invalid cyclone position');
  if (now - time > 36 * 3600000 || time > now + 3600000 || /THIS IS THE FINAL WARNING/i.test(text))
    return null;
  const actual = text.split('FORECASTS:')[0];
  const wind = actual.match(/MAX SUSTAINED WINDS\s*-\s*(\d+)\s*KT/);
  const gust = actual.match(/GUSTS\s+(\d+)\s*KT/);
  const movement = actual.match(/MOVEMENT PAST SIX HOURS\s*-\s*(\d+) DEGREES AT\s*(\d+) KTS/);
  return {
    id,
    name: name[2].trim().slice(0, 80),
    designation: name[1],
    lat,
    lng,
    time,
    windKnots: wind ? +wind[1] : null,
    gustKnots: gust ? +gust[1] : null,
    direction: movement ? +movement[1] : null,
    speedKnots: movement ? +movement[2] : null,
    source: ROOT + '/products/' + id + 'web.txt',
  };
}
async function read(url, fetcher) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('JTWC unavailable');
  let text = '',
    size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 500000) throw new Error('Oversized bulletin');
      text += new TextDecoder().decode(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return text;
}
export function createCyclones({ fetcher = fetch, now = Date.now } = {}) {
  const router = express.Router();
  let cache = null,
    expires = 0,
    pending = null;
  router.use(rateLimit({ limit: 60 }), concurrencyLimit(12));
  router.get('/', async (req, res) => {
    try {
      if (now() < expires) {
        if (cache) return res.json(cache);
        throw new Error('Retry later');
      }
      if (!pending)
        pending = (async () => {
          const feed = parseCycloneFeed(await read(ROOT + '/rss/jtwc.rss', fetcher), now());
          const items = (
            await Promise.all(
              feed.products.map(async (id) =>
                parseCycloneWarning(
                  await read(ROOT + '/products/' + id + 'web.txt', fetcher),
                  id,
                  feed.time,
                  now(),
                ),
              ),
            )
          ).filter(Boolean);
          cache = {
            items,
            feedTime: feed.time,
            fetchedAt: now(),
            source: 'JTWC',
            coverage: 'Pacific and Indian Oceans',
          };
          expires = now() + 10 * 60000;
          return cache;
        })().finally(() => {
          pending = null;
        });
      res.set('Cache-Control', 'public, max-age=60').json(await pending);
    } catch {
      cache = null;
      expires = now() + 30000;
      res.status(503).json({ error: 'Current cyclone data unavailable' });
    }
  });
  return { router };
}
